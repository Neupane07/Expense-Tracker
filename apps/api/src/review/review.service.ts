import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { z } from 'zod';
import { ExpenseType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  expenseWhere,
  merchantKey,
  parseInput,
} from '../expense-core/expense-validation';
const selection = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });
const categorySchema = z.object({
  vendor: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  subcategory: z.string().max(100).nullable().optional(),
  expenseType: z.enum(ExpenseType),
  notes: z.string().max(2000).nullable().optional(),
});
const applySchema = selection
  .extend({
    category: categorySchema,
    remember: z.boolean().default(false),
    revisions: z.record(z.string(), z.number().int().nonnegative()),
    overwriteManual: z.boolean().default(false),
  })
  .strict();
const asJson = (data: unknown) =>
  JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}
  aliases(userId: string) {
    return this.prisma.merchantAlias.findMany({
      where: { userId },
      orderBy: { alias: 'asc' },
    });
  }
  async saveAlias(userId: string, input: unknown) {
    const data = parseInput(
      z
        .object({
          alias: z.string().min(1).max(200),
          canonical: z.string().min(1).max(200),
        })
        .strict(),
      input,
    );
    const alias = merchantKey(data.alias),
      canonical = merchantKey(data.canonical);
    if (!alias || !canonical || alias === canonical)
      throw new BadRequestException('Choose two distinct merchant names');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (
        await tx.merchantAlias.count({
          where: { userId, OR: [{ alias: canonical }, { canonical: alias }] },
        })
      )
        throw new BadRequestException(
          'Aliases must point directly to a canonical merchant, without chains',
        );
      return tx.merchantAlias.upsert({
        where: { userId_alias: { userId, alias } },
        create: { userId, alias, canonical },
        update: { canonical },
      });
    });
  }
  async removeAlias(userId: string, id: string) {
    await this.prisma.merchantAlias.deleteMany({ where: { id, userId } });
    return { deleted: true };
  }
  async groups(userId: string, input: unknown) {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, ...expenseWhere(input), reviewStatus: 'NEEDS_REVIEW' },
      include: {
        category: true,
        account: { select: { id: true, name: true } },
      },
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.accountId}:${row.merchantKey ?? merchantKey(row.descriptionClean)}:${row.reviewReason ?? 'Unclassified'}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return {
      groups: [...groups].map(([key, transactions]) => ({ key, transactions })),
      limited: rows.length === 500,
    };
  }
  async preview(userId: string, input: unknown) {
    const { ids } = parseInput(selection, input);
    const rows = await this.prisma.transaction.findMany({
      where: { userId, id: { in: ids } },
      include: { category: true },
    });
    if (rows.length !== new Set(ids).size)
      throw new BadRequestException('Some transactions are unavailable');
    return {
      transactions: rows,
      revisions: Object.fromEntries(rows.map((r) => [r.id, r.revision])),
      manualLocked: rows.filter((r) => r.category?.isManual).map((r) => r.id),
      canRemember:
        new Set(
          rows.map(
            (r) =>
              `${r.accountId}:${r.moneyOut.gt(0) ? 'OUT' : 'IN'}:${r.merchantKey ?? merchantKey(r.descriptionClean)}`,
          ),
        ).size === 1,
    };
  }
  async apply(userId: string, input: unknown) {
    const data = parseInput(applySchema, input);
    if (data.overwriteManual && data.ids.length !== 1)
      throw new BadRequestException(
        'Manual overrides must be edited individually',
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Transaction" WHERE "userId" = ${userId} AND "id" IN (${Prisma.join(data.ids)}) ORDER BY "id" FOR UPDATE`;
      const rows = await tx.transaction.findMany({
        where: { userId, id: { in: data.ids } },
        include: { category: true },
      });
      if (
        rows.length !== new Set(data.ids).size ||
        rows.some((r) => data.revisions[r.id] !== r.revision)
      )
        throw new ConflictException('Transactions changed. Preview again.');
      const eligible = rows.filter(
        (r) => !r.category?.isManual || data.overwriteManual,
      );
      if (!eligible.length)
        throw new BadRequestException(
          'All selected transactions are manually locked',
        );
      const signatures = new Set(
        eligible.map(
          (r) =>
            `${r.accountId}:${r.moneyOut.gt(0) ? 'OUT' : 'IN'}:${r.merchantKey ?? merchantKey(r.descriptionClean)}`,
        ),
      );
      if (data.remember && signatures.size !== 1)
        throw new BadRequestException(
          'Remember one merchant, account and direction at a time',
        );
      let ruleId: string | undefined;
      if (data.remember) {
        const row = eligible[0],
          key = row.merchantKey ?? merchantKey(row.descriptionClean);
        if (!key || /\b(?:unknown|paytm|razorpay|cashfree|upi)\b/.test(key))
          throw new BadRequestException(
            'Use a specific merchant before remembering this decision',
          );
        const previous = await tx.rule.aggregate({
          where: { userId },
          _min: { priority: true },
        });
        const { notes: _notes, ...ruleCategory } = data.category;
        void _notes;
        const rule = await tx.rule.create({
          data: {
            userId,
            accountId: row.accountId,
            direction: row.moneyOut.gt(0) ? 'OUT' : 'IN',
            merchantKey: key,
            matchType: 'CONTAINS',
            pattern: '',
            priority: Math.min(0, (previous._min.priority ?? 1) - 1),
            origin: 'LEARNED',
            ...ruleCategory,
          },
        });
        ruleId = rule.id;
      }
      const batch = await tx.reviewBatch.create({ data: { userId, ruleId } });
      for (const row of eligible) {
        await tx.classificationChange.create({
          data: {
            userId,
            batchId: batch.id,
            transactionId: row.id,
            afterRevision: row.revision + 1,
            before: asJson({
              category: row.category,
              reviewStatus: row.reviewStatus,
              reviewReason: row.reviewReason,
            }),
          },
        });
        await tx.transactionCategory.upsert({
          where: { transactionId: row.id },
          create: {
            transactionId: row.id,
            ...data.category,
            isManual: true,
            ruleId: null,
            notes:
              data.category.notes === undefined
                ? (row.category?.notes ?? 'User decision')
                : data.category.notes,
            confidence: 100,
          },
          update: {
            ...data.category,
            subcategory: data.category.subcategory ?? null,
            isManual: true,
            ruleId: null,
            notes:
              data.category.notes === undefined
                ? (row.category?.notes ?? 'User decision')
                : data.category.notes,
            confidence: 100,
          },
        });
        await tx.transaction.update({
          where: { id: row.id },
          data: {
            reviewStatus:
              data.category.expenseType === 'REVIEW'
                ? 'NEEDS_REVIEW'
                : 'USER_REVIEWED',
            reviewReason:
              data.category.expenseType === 'REVIEW'
                ? 'User deferred classification'
                : null,
            revision: { increment: 1 },
          },
        });
      }
      return {
        batchId: batch.id,
        updatedRows: eligible.length,
        skippedManual: rows.length - eligible.length,
        ruleId,
      };
    });
  }
  async undo(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ReviewBatch" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
      const batch = await tx.reviewBatch.findFirst({
        where: { id, userId },
        include: { changes: true },
      });
      if (!batch) throw new BadRequestException('Batch unavailable');
      if (batch.undoneAt) return { restored: 0, conflicts: [] };
      let restored = 0;
      const conflicts: string[] = [];
      for (const change of [...batch.changes].sort((a, b) =>
        a.transactionId.localeCompare(b.transactionId),
      )) {
        if (change.undone) continue;
        await tx.$queryRaw`SELECT "id" FROM "Transaction" WHERE "id" = ${change.transactionId} AND "userId" = ${userId} FOR UPDATE`;
        const row = await tx.transaction.findFirst({
          where: { id: change.transactionId, userId },
        });
        if (!row || row.revision !== change.afterRevision) {
          conflicts.push(change.transactionId);
          continue;
        }
        const before = change.before as {
          category: {
            vendor: string;
            category: string;
            subcategory: string | null;
            expenseType: ExpenseType;
            isManual: boolean;
            ruleId: string | null;
            confidence: number;
            notes: string | null;
          } | null;
          reviewStatus: string;
          reviewReason: string | null;
        };
        if (before.category) {
          const {
            vendor,
            category,
            subcategory,
            expenseType,
            isManual,
            ruleId,
            confidence,
            notes,
          } = before.category;
          const value = {
            vendor,
            category,
            subcategory,
            expenseType,
            isManual,
            ruleId,
            confidence,
            notes,
          };
          await tx.transactionCategory.upsert({
            where: { transactionId: row.id },
            create: { transactionId: row.id, ...value },
            update: value,
          });
        } else
          await tx.transactionCategory.deleteMany({
            where: { transactionId: row.id },
          });
        await tx.transaction.update({
          where: { id: row.id },
          data: {
            reviewStatus: before.reviewStatus,
            reviewReason: before.reviewReason,
            revision: { increment: 1 },
          },
        });
        await tx.classificationChange.update({
          where: { id: change.id },
          data: { undone: true },
        });
        restored++;
      }
      let ruleConflict = false;
      if (batch.ruleId) {
        const disabled = await tx.rule.updateMany({
          where: {
            id: batch.ruleId,
            userId,
            updatedAt: { lte: batch.createdAt },
          },
          data: { isActive: false },
        });
        ruleConflict = disabled.count === 0;
      }
      await tx.reviewBatch.update({
        where: { id },
        data: { undoneAt: new Date() },
      });
      return { restored, conflicts, ruleConflict };
    });
  }
}
