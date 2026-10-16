import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseJob } from '../generated/prisma/client';
import { GmailError, GmailService } from './gmail.service';
@Injectable()
export class ExpenseJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailService,
  ) {}
  async tick() {
    if (!this.gmail.enabled()) return;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<
        Array<{
          id: string;
          userId: string;
          generation: number;
          watermark: Date | null;
        }>
      >`SELECT "id", "userId", "generation", "watermark" FROM "EmailConnection" WHERE "status" = 'ACTIVE' AND "nextPollAt" <= ${now} FOR UPDATE SKIP LOCKED LIMIT 10`;
      for (const c of due) {
        const pending = await tx.expenseJob.count({
          where: {
            connectionId: c.id,
            generation: c.generation,
            kind: 'POLL',
            status: { in: ['PENDING', 'RUNNING'] },
          },
        });
        if (!pending)
          await tx.expenseJob.create({
            data: {
              userId: c.userId,
              connectionId: c.id,
              generation: c.generation,
              kind: 'POLL',
              from: new Date((c.watermark ?? now).getTime() - 7 * 86400000),
              to: now,
            },
          });
        await tx.emailConnection.update({
          where: { id: c.id },
          data: { nextPollAt: new Date(now.getTime() + 900000) },
        });
      }
    });
    const leaseToken = randomUUID();
    const jobs = await this.prisma.$queryRaw<
      ExpenseJob[]
    >`UPDATE "ExpenseJob" SET "status" = 'RUNNING', "leaseUntil" = NOW() + INTERVAL '5 minutes', "leaseToken" = ${leaseToken}, "attempts" = "attempts" + 1 WHERE "id" = (SELECT "id" FROM "ExpenseJob" WHERE ("status" = 'PENDING' AND "availableAt" <= NOW()) OR ("status" = 'RUNNING' AND "leaseUntil" < NOW()) ORDER BY "createdAt", "from" DESC FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
    const job = jobs[0];
    if (!job) return;
    const heartbeat = setInterval(() => {
      void this.prisma.expenseJob
        .updateMany({
          where: { id: job.id, leaseToken, status: 'RUNNING' },
          data: { leaseUntil: new Date(Date.now() + 300000) },
        })
        .catch(() => undefined);
    }, 60000);
    try {
      const next = await this.gmail.collect(job);
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.expenseJob.updateMany({
          where: { id: job.id, leaseToken, status: 'RUNNING' },
          data: {
            status: next ? 'PENDING' : 'COMPLETED',
            pageToken: next,
            attempts: 0,
            leaseToken: null,
            leaseUntil: null,
            errorCode: null,
          },
        });
        if (!next && updated.count)
          await tx.emailConnection.updateMany({
            where: {
              id: job.connectionId,
              userId: job.userId,
              generation: job.generation,
            },
            data: {
              lastCheckedAt: new Date(),
              errorCode: null,
              ...(job.kind === 'POLL' ? { watermark: job.to } : {}),
            },
          });
      });
    } catch (error) {
      const code = error instanceof GmailError ? error.code : 'SYNC_FAILED';
      await this.prisma.expenseJob.updateMany({
        where: { id: job.id, leaseToken, status: 'RUNNING' },
        data: {
          status:
            code === 'CANCELLED'
              ? 'CANCELLED'
              : job.attempts >= 5
                ? 'FAILED'
                : 'PENDING',
          errorCode: code,
          ...(code === 'INVALID_PAGE_TOKEN' ? { pageToken: null } : {}),
          leaseToken: null,
          leaseUntil: null,
          availableAt: new Date(
            Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts),
          ),
        },
      });
      await this.prisma.emailConnection.updateMany({
        where: { id: job.connectionId, generation: job.generation },
        data: {
          errorCode: code,
          ...(code === 'RECONNECT_REQUIRED'
            ? { status: 'RECONNECT_REQUIRED' }
            : {}),
        },
      });
    } finally {
      clearInterval(heartbeat);
    }
  }
}
