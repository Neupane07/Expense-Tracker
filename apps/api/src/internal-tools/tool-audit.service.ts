import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapPrismaStatusToToolStatus,
  mapPrismaToolStatus,
} from './tool-envelope';
import { ToolRedactionService } from './tool-redaction.service';
import type { ToolExecutionStatus } from './tool.types';

export type CreateToolAuditInput = {
  userId: string;
  toolName: string;
  toolVersion: string;
  input: unknown;
};

export type CompleteToolAuditInput = {
  auditId: string;
  userId: string;
  status: ToolExecutionStatus;
  startedAt: Date;
  durationMs: number;
  warningCount: number;
  rejectCount: number;
  errorCode?: string | null;
};

@Injectable()
export class ToolAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redaction: ToolRedactionService,
  ) {}

  async createPending(input: CreateToolAuditInput) {
    const startedAt = new Date();
    const inputMeta = this.redaction.buildInputMeta(input.input);
    const inputHash = this.redaction.hashInputMeta(input.input);

    return this.prisma.toolExecutionAudit.create({
      data: {
        userId: input.userId,
        toolName: input.toolName,
        toolVersion: input.toolVersion,
        status: 'ERROR',
        startedAt,
        inputHash,
        inputMeta: inputMeta as Prisma.InputJsonValue,
      },
    });
  }

  async complete(input: CompleteToolAuditInput) {
    return this.prisma.toolExecutionAudit.updateMany({
      where: {
        id: input.auditId,
        userId: input.userId,
      },
      data: {
        status: mapPrismaToolStatus(input.status),
        completedAt: new Date(),
        durationMs: input.durationMs,
        warningCount: input.warningCount,
        rejectCount: input.rejectCount,
        errorCode: input.errorCode ?? null,
      },
    });
  }

  async listForUser(userId: string, limit = 50) {
    const rows = await this.prisma.toolExecutionAudit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      toolName: row.toolName,
      toolVersion: row.toolVersion,
      status: mapPrismaStatusToToolStatus(row.status),
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      durationMs: row.durationMs,
      warningCount: row.warningCount,
      rejectCount: row.rejectCount,
      errorCode: row.errorCode,
      inputHash: row.inputHash,
      inputMeta: this.redaction.redactValue(row.inputMeta),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async findForUser(userId: string, auditId: string) {
    const row = await this.prisma.toolExecutionAudit.findFirst({
      where: { id: auditId, userId },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      toolName: row.toolName,
      toolVersion: row.toolVersion,
      status: mapPrismaStatusToToolStatus(row.status),
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      durationMs: row.durationMs,
      warningCount: row.warningCount,
      rejectCount: row.rejectCount,
      errorCode: row.errorCode,
      inputHash: row.inputHash,
      inputMeta: this.redaction.redactValue(row.inputMeta),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
