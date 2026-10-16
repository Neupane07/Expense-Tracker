import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { dateString, parseInput } from '../expense-core/expense-validation';
import { AccountType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateAccountInput = {
  name?: string;
  institution?: string;
  type?: string;
  lastFour?: string | null;
};

const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(80),
  institution: z.string().trim().min(1, 'institution is required').max(80),
  type: z.enum(AccountType, { error: 'Unsupported account type' }),
  lastFour: z
    .string()
    .trim()
    .max(32, 'reference id must be 32 characters or fewer')
    .optional()
    .nullable(),
});

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.account.findMany({
      where: { userId },
      omit: { statementPassword: true },
      orderBy: [
        {
          type: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async findOne(userId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, userId },
      omit: { statementPassword: true },
      include: { identifiers: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async update(userId: string, id: string, input: unknown) {
    const old = await this.findOne(userId, id);
    const value = parseInput(
      z
        .object({
          name: z.string().trim().min(1).max(80).optional(),
          openedAt: dateString.nullable().optional(),
          closedAt: dateString.nullable().optional(),
          archived: z.boolean().optional(),
          reviewEverything: z.boolean().optional(),
        })
        .strict(),
      input,
    );
    const openedAt =
      value.openedAt === undefined
        ? old.openedAt
        : value.openedAt
          ? new Date(value.openedAt)
          : null;
    const closedAt =
      value.closedAt === undefined
        ? old.closedAt
        : value.closedAt
          ? new Date(value.closedAt)
          : null;
    if (openedAt && closedAt && openedAt > closedAt)
      throw new BadRequestException('Closure must follow opening');
    return this.prisma.account.update({
      where: { id, userId },
      data: {
        name: value.name,
        openedAt,
        closedAt,
        archivedAt:
          value.archived === undefined
            ? undefined
            : value.archived
              ? new Date()
              : null,
        reviewEverything: value.reviewEverything,
      },
      omit: { statementPassword: true },
    });
  }

  async addIdentifier(userId: string, id: string, input: unknown) {
    await this.findOne(userId, id);
    const data = parseInput(
      z
        .object({
          value: z.string().trim().min(1).max(64),
          sourceType: z.enum(['ICICI_BANK', 'ICICI_AMAZON_PAY_CARD']),
          validFrom: dateString.optional(),
          validTo: dateString.optional(),
        })
        .strict()
        .refine(
          (x) => !x.validFrom || !x.validTo || x.validFrom <= x.validTo,
          'Invalid identifier dates',
        ),
      input,
    );
    return this.prisma.accountIdentifier.upsert({
      where: {
        accountId_value_sourceType: {
          accountId: id,
          value: data.value,
          sourceType: data.sourceType,
        },
      },
      create: {
        ...data,
        userId,
        accountId: id,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
      update: {
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
    });
  }

  async coverage(userId: string, id: string, input: unknown) {
    const account = await this.findOne(userId, id);
    const range = parseInput(
      z
        .object({ from: dateString.optional(), to: dateString.optional() })
        .refine((x) => !x.from || !x.to || x.from <= x.to, 'Invalid period'),
      input,
    );
    const documents = await this.prisma.sourceDocument.findMany({
      where: { userId, accountId: id, deletedAt: null },
      select: {
        id: true,
        kind: true,
        status: true,
        statementFrom: true,
        statementTo: true,
        coverageStatus: true,
        createdAt: true,
      },
    });
    const earliest = await this.prisma.transaction.findFirst({
      where: { userId, accountId: id },
      orderBy: { transactionDate: 'asc' },
      select: { transactionDate: true },
    });
    const statementStart = documents.reduce<Date | null>(
      (date, d) =>
        d.statementFrom && (!date || d.statementFrom < date)
          ? d.statementFrom
          : date,
      null,
    );
    const earliestDate =
      earliest?.transactionDate && statementStart
        ? earliest.transactionDate < statementStart
          ? earliest.transactionDate
          : statementStart
        : (earliest?.transactionDate ?? statementStart);
    const start = new Date(
      range.from ?? account.openedAt ?? earliestDate ?? new Date(),
    );
    const latest = account.closedAt
      ? await this.prisma.transaction.findFirst({
          where: { userId, accountId: id },
          orderBy: { transactionDate: 'desc' },
          select: { transactionDate: true },
        })
      : null;
    const end = new Date(
      range.to ??
        (account.closedAt
          ? new Date(
              Math.max(
                account.closedAt.getTime(),
                latest?.transactionDate.getTime() ?? 0,
              ),
            )
          : new Date()),
    );
    const alertRows = await this.prisma.transaction.findMany({
      where: {
        userId,
        accountId: id,
        confirmation: 'UNCONFIRMED',
        transactionDate: { gte: start, lte: end },
      },
      select: { transactionDate: true },
    });
    const alertMonths = new Set(
      alertRows.map((r) => r.transactionDate.toISOString().slice(0, 7)),
    );
    const months: { month: string; status: string; documentIds: string[] }[] =
      [];
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    while (cursor <= end && months.length < 1200) {
      const next = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
      const relevant = documents.filter(
        (d) =>
          d.statementFrom &&
          d.statementTo &&
          d.statementFrom < next &&
          d.statementTo >= cursor,
      );
      const spans = relevant
        .filter((d) => d.coverageStatus === 'RECONCILED')
        .sort(
          (a, b) => a.statementFrom!.getTime() - b.statementFrom!.getTime(),
        );
      let coveredTo = Math.max(cursor.getTime(), start.getTime());
      for (const d of spans)
        if (d.statementFrom!.getTime() <= coveredTo)
          coveredTo = Math.max(coveredTo, d.statementTo!.getTime() + 86400000);
      const full =
        coveredTo >= Math.min(next.getTime(), end.getTime() + 86400000);
      const alerts = alertMonths.has(cursor.toISOString().slice(0, 7));
      months.push({
        month: cursor.toISOString().slice(0, 7),
        status: full
          ? 'RECONCILED'
          : relevant.length
            ? 'UNVERIFIED'
            : alerts
              ? 'ALERTS_ONLY'
              : 'MISSING',
        documentIds: relevant.map((d) => d.id),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return {
      accountId: id,
      months,
      statements: documents,
      truncated: cursor <= end,
    };
  }

  create(userId: string, input: CreateAccountInput) {
    const result = createAccountSchema.safeParse(input);

    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message),
      );
    }

    return this.prisma.account.create({
      omit: { statementPassword: true },
      data: {
        userId,
        name: result.data.name,
        institution: result.data.institution,
        type: result.data.type,
        lastFour: result.data.lastFour || null,
      },
    });
  }
}
