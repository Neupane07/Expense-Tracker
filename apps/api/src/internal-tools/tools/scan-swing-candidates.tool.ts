import { BadRequestException, Injectable } from '@nestjs/common';
import type { RunSwingScanInput } from '../../scanner/scanner.dto';
import { SwingScannerService } from '../../scanner/swing-scanner.service';
import type { ToolContext, ToolHandlerResult } from '../tool.types';
import { scanSwingCandidatesInputSchema } from '../tool-schemas';
import { scanSwingCandidatesOutputSchema } from '../tool-output-schemas';

@Injectable()
export class ScanSwingCandidatesTool {
  constructor(private readonly swingScanner: SwingScannerService) {}

  readonly definition = {
    name: 'scan_swing_candidates',
    version: '1',
    description:
      'User-triggered swing scan over holdings or explicit symbols. Research-only; does not place orders.',
    readOnly: true as const,
    inputSchema: scanSwingCandidatesInputSchema,
    outputSchema: scanSwingCandidatesOutputSchema,
    handler: (context: ToolContext, input: RunSwingScanInput) =>
      this.handle(context, input),
  };

  async handle(
    context: ToolContext,
    input: RunSwingScanInput,
  ): Promise<ToolHandlerResult> {
    try {
      const result = await this.swingScanner.runScan(context.userId, input, {
        abortSignal: context.abortSignal,
      });
      const rejectedCount = result.candidates.filter(
        (candidate) => candidate.status === 'rejected',
      ).length;

      return {
        status: result.candidates.length === 0 ? 'rejected' : 'ok',
        data: result,
        dataQuality: {
          runAt: result.runAt,
          candidateCount: result.candidateCount,
          universeSource: result.universeSource,
        },
        warnings: result.warnings,
        rejectReasons:
          rejectedCount > 0 ? [`REJECTED_CANDIDATES:${rejectedCount}`] : [],
        asOf: result.runAt,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        const response = error.getResponse() as {
          blockers?: string[];
          warnings?: string[];
          status?: string;
        };

        return {
          status: 'unavailable',
          data:
            typeof response === 'object'
              ? response
              : { message: error.message },
          dataQuality: { readiness: response.status ?? 'BLOCKED' },
          warnings: response.warnings ?? [],
          rejectReasons: response.blockers ?? ['SCANNER_READINESS_BLOCKED'],
          errorCode: 'SCANNER_READINESS_BLOCKED',
        };
      }

      throw error;
    }
  }
}
