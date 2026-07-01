import {
  BadRequestException,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ZodError } from 'zod';
import type { AuthenticatedUser } from '../auth/auth.types';
import { buildToolEnvelope } from './tool-envelope';
import { ToolAuditService } from './tool-audit.service';
import { ToolRedactionService } from './tool-redaction.service';
import { ToolRegistryService } from './tool-registry.service';
import type { ToolContext, ToolEnvelope } from './tool.types';
import {
  DEFAULT_MAX_RESULT_BYTES,
  DEFAULT_TOOL_TIMEOUT_MS,
} from './tool.types';

@Injectable()
export class ToolExecutorService {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly audit: ToolAuditService,
    private readonly redaction: ToolRedactionService,
  ) {}

  async execute(
    user: AuthenticatedUser,
    toolName: string,
    rawInput: unknown,
  ): Promise<ToolEnvelope> {
    const definition = this.registry.get(toolName);
    const startedAt = Date.now();
    const abortController = new AbortController();
    const auditRow = await this.audit.createPending({
      userId: user.id,
      toolName: definition.name,
      toolVersion: definition.version,
      input: rawInput ?? {},
    });

    try {
      const parsedInput = this.parseInput(definition.inputSchema, rawInput);
      const context = this.buildContext(user, abortController.signal);
      const handlerResult = await this.runWithTimeout(
        definition.handler(context, parsedInput),
        definition.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
        abortController,
      );
      const outputParse = definition.outputSchema.safeParse(handlerResult.data);

      if (!outputParse.success) {
        throw new Error('TOOL_OUTPUT_SCHEMA_MISMATCH');
      }

      const envelope = buildToolEnvelope({
        tool: definition.name,
        version: definition.version,
        auditId: auditRow.id,
        durationMs: Date.now() - startedAt,
        result: handlerResult,
      });
      const redactedEnvelope = this.redaction.redactResponse(envelope);
      this.assertResultSize(
        redactedEnvelope,
        definition.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES,
      );

      await this.audit.complete({
        auditId: auditRow.id,
        userId: user.id,
        status: handlerResult.status,
        startedAt: auditRow.startedAt,
        durationMs: envelope.durationMs,
        warningCount: envelope.warnings.length,
        rejectCount: envelope.rejectReasons.length,
        errorCode: handlerResult.errorCode ?? null,
      });

      return redactedEnvelope;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const normalized = this.normalizeError(error);
      const envelope = buildToolEnvelope({
        tool: definition.name,
        version: definition.version,
        auditId: auditRow.id,
        durationMs,
        result: {
          status: normalized.status,
          data: normalized.data,
          dataQuality: { error: true },
          warnings: normalized.warnings,
          rejectReasons: normalized.rejectReasons,
          errorCode: normalized.errorCode,
        },
      });
      const redactedEnvelope = this.redaction.redactResponse(envelope);

      await this.audit.complete({
        auditId: auditRow.id,
        userId: user.id,
        status: normalized.status,
        startedAt: auditRow.startedAt,
        durationMs,
        warningCount: envelope.warnings.length,
        rejectCount: envelope.rejectReasons.length,
        errorCode: normalized.errorCode,
      });

      return redactedEnvelope;
    }
  }

  private buildContext(
    user: AuthenticatedUser,
    abortSignal: AbortSignal,
  ): ToolContext {
    return {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      abortSignal,
    };
  }

  private parseInput<T>(
    schema: {
      safeParse: (value: unknown) => {
        success: boolean;
        data?: T;
        error?: ZodError;
      };
    },
    rawInput: unknown,
  ) {
    const parsed = schema.safeParse(rawInput ?? {});

    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid tool input',
        issues: parsed.error?.issues ?? [],
      });
    }

    return parsed.data as T;
  }

  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    abortController: AbortController,
  ) {
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            abortController.abort();
            reject(new RequestTimeoutException('TOOL_EXECUTION_TIMEOUT'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private assertResultSize(envelope: ToolEnvelope, maxBytes: number) {
    const size = Buffer.byteLength(JSON.stringify(envelope), 'utf8');

    if (size > maxBytes) {
      throw new Error('TOOL_RESULT_TOO_LARGE');
    }
  }

  private normalizeError(error: unknown): {
    status: 'error' | 'unavailable' | 'rejected';
    data: Record<string, unknown>;
    warnings: string[];
    rejectReasons: string[];
    errorCode: string;
  } {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();

      return {
        status: 'rejected',
        data: {
          message:
            typeof response === 'string'
              ? response
              : ((response as { message?: string }).message ?? 'Rejected'),
          details: response,
        },
        warnings: [],
        rejectReasons: ['INVALID_INPUT'],
        errorCode: 'INVALID_INPUT',
      };
    }

    if (error instanceof NotFoundException) {
      return {
        status: 'unavailable',
        data: { message: error.message },
        warnings: [],
        rejectReasons: ['NOT_FOUND'],
        errorCode: 'NOT_FOUND',
      };
    }

    if (error instanceof RequestTimeoutException) {
      return {
        status: 'error',
        data: { message: 'Tool execution timed out' },
        warnings: [],
        rejectReasons: [],
        errorCode: 'TOOL_EXECUTION_TIMEOUT',
      };
    }

    if (error instanceof Error) {
      if (error.message === 'TOOL_OUTPUT_SCHEMA_MISMATCH') {
        return {
          status: 'error',
          data: { message: 'Tool output failed schema validation' },
          warnings: [],
          rejectReasons: [],
          errorCode: 'TOOL_OUTPUT_SCHEMA_MISMATCH',
        };
      }

      if (error.message === 'TOOL_RESULT_TOO_LARGE') {
        return {
          status: 'error',
          data: { message: 'Tool result exceeded size limit' },
          warnings: [],
          rejectReasons: [],
          errorCode: 'TOOL_RESULT_TOO_LARGE',
        };
      }
    }

    return {
      status: 'error',
      data: { message: 'Tool execution failed' },
      warnings: [],
      rejectReasons: [],
      errorCode: 'TOOL_EXECUTION_ERROR',
    };
  }
}
