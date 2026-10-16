import { z } from 'zod';
import { parseInput, merchantKey } from '../expense-core/expense-validation';
import { classify, ruleMatches as matchesRow } from '../expense-core/classify';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseType,
  MatchType,
  Rule,
  Prisma,
} from '../generated/prisma/client';
import { defaultRules } from '../auth/default-financial-data';
import { PrismaService } from '../prisma/prisma.service';

export type CreateRuleInput = {
  accountId?: string | null;
  direction?: string | null;
  merchantKey?: string | null;
  priority?: number;
  matchType?: string;
  pattern?: string;
  vendor?: string;
  category?: string;
  subcategory?: string | null;
  expenseType?: string;
};

export type UpdateRuleInput = CreateRuleInput & {
  isActive?: boolean;
};

const ruleInputSchema = z
  .object({
    accountId: z.string().min(1).nullable().optional(),
    direction: z.enum(['IN', 'OUT']).nullable().optional(),
    merchantKey: z.string().max(200).nullable().optional(),
    priority: z.number().int().min(-2147483647).max(2147483647).optional(),
    matchType: z.enum(MatchType).optional(),
    pattern: z.string().max(1000).optional(),
    vendor: z.string().max(100).optional(),
    category: z.string().max(100).optional(),
    subcategory: z.string().max(100).nullable().optional(),
    expenseType: z.enum(ExpenseType).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.rule.findMany({
      where: { userId },
      orderBy: [
        {
          priority: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async findOne(userId: string, id: string) {
    const rule = await this.prisma.rule.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: {
            categories: true,
          },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${id} was not found`);
    }

    return rule;
  }

  async create(userId: string, input: CreateRuleInput) {
    const data = await this.validateRuleInput(userId, input);

    return this.prisma.rule.create({
      data,
    });
  }

  async update(userId: string, id: string, input: UpdateRuleInput) {
    input = parseInput(ruleInputSchema, input);
    const existingRule = await this.prisma.rule.findFirst({
      where: { id, userId },
    });

    if (!existingRule) {
      throw new NotFoundException(`Rule ${id} was not found`);
    }

    const data = await this.validateRuleInput(userId, {
      accountId:
        input.accountId === undefined
          ? existingRule.accountId
          : input.accountId,
      direction:
        input.direction === undefined
          ? existingRule.direction
          : input.direction,
      merchantKey:
        input.merchantKey === undefined
          ? existingRule.merchantKey
          : input.merchantKey,
      priority: input.priority ?? existingRule.priority,
      matchType: input.matchType ?? existingRule.matchType,
      pattern: input.pattern ?? existingRule.pattern,
      vendor: input.vendor ?? existingRule.vendor,
      category: input.category ?? existingRule.category,
      subcategory: input.subcategory ?? existingRule.subcategory,
      expenseType: input.expenseType ?? existingRule.expenseType,
    });

    return this.prisma.rule.update({
      where: { id },
      data: {
        accountId: data.accountId,
        direction: data.direction,
        merchantKey: data.merchantKey,
        priority: data.priority,
        matchType: data.matchType,
        pattern: data.pattern,
        vendor: data.vendor,
        category: data.category,
        subcategory: data.subcategory,
        expenseType: data.expenseType,
        isActive: input.isActive ?? existingRule.isActive,
      },
    });
  }

  async createDefaults(userId: string) {
    const existingRules = await this.prisma.rule.findMany({
      where: { userId },
      select: {
        pattern: true,
      },
    });
    const existingPatterns = new Set(
      existingRules.map((rule) => rule.pattern.toLowerCase()),
    );
    const rulesToCreate = defaultRules.filter(
      (rule) => !existingPatterns.has(rule.pattern.toLowerCase()),
    );

    if (rulesToCreate.length > 0) {
      await this.prisma.rule.createMany({
        data: rulesToCreate.map((rule) => ({
          ...rule,
          userId,
          origin: 'STARTER',
        })),
      });
    }

    const rules = await this.prisma.rule.findMany({
      where: { userId, isActive: true },
      orderBy: [
        {
          priority: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
    const updatedRows = await this.applyBestMatchingRules(userId, rules);

    return {
      createdRules: rulesToCreate.length,
      updatedRows,
    };
  }

  async apply(userId: string, id: string) {
    const rule = await this.prisma.rule.findFirst({
      where: { id, userId },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${id} was not found`);
    }

    if (!rule.isActive) {
      throw new BadRequestException(
        'Inactive rules cannot be applied to existing transactions. Activate the rule first.',
      );
    }

    const candidates = await this.prisma.transaction.findMany({
      where: { userId },
      include: {
        category: true,
      },
    });
    const matchingTransactions = candidates.filter((transaction) =>
      matchesRow(rule, {
        ...transaction,
        moneyIn: Number(transaction.moneyIn),
        moneyOut: Number(transaction.moneyOut),
      }),
    );
    let updatedRows = 0;
    for (const transaction of matchingTransactions) {
      if (await this.applyAutomatic(userId, transaction.id, rule, false))
        updatedRows++;
    }
    return {
      ruleId: rule.id,
      matchedRows: matchingTransactions.length,
      updatedRows,
    };
  }

  private async applyAutomatic(
    userId: string,
    id: string,
    rule: Rule,
    onlyReview: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Transaction" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
      const row = await tx.transaction.findFirst({
        where: { id, userId },
        include: { category: true, account: true },
      });
      if (
        !row ||
        row.category?.isManual ||
        (onlyReview && row.category && row.category.expenseType !== 'REVIEW')
      )
        return false;
      const category = classify(
        {
          ...row,
          moneyIn: Number(row.moneyIn),
          moneyOut: Number(row.moneyOut),
        },
        [rule],
      );
      const batch = await tx.reviewBatch.create({ data: { userId } });
      await tx.classificationChange.create({
        data: {
          userId,
          batchId: batch.id,
          transactionId: row.id,
          afterRevision: row.revision + 1,
          before: JSON.parse(
            JSON.stringify({
              category: row.category,
              reviewStatus: row.reviewStatus,
              reviewReason: row.reviewReason,
            }),
          ) as Prisma.InputJsonValue,
        },
      });
      await tx.transactionCategory.upsert({
        where: { transactionId: id },
        create: { transactionId: id, ...category },
        update: category,
      });
      await tx.transaction.update({
        where: { id },
        data: {
          revision: { increment: 1 },
          reviewStatus:
            row.account.reviewEverything || category.expenseType === 'REVIEW'
              ? 'NEEDS_REVIEW'
              : 'AUTO_ACCEPTED',
          reviewReason: category.notes,
        },
      });
      return true;
    });
  }

  private async validateRuleInput(userId: string, input: CreateRuleInput) {
    input = parseInput(ruleInputSchema, input);
    const pattern = input.pattern?.trim();
    const vendor = input.vendor?.trim();
    const category = input.category?.trim();

    if (!pattern && !input.merchantKey) {
      throw new BadRequestException('pattern is required');
    }

    if (!vendor) {
      throw new BadRequestException('vendor is required');
    }

    if (!category) {
      throw new BadRequestException('category is required');
    }

    if (!input.expenseType) {
      throw new BadRequestException('expenseType is required');
    }

    const [matchType, expenseType, maxPriority] = await Promise.all([
      Promise.resolve(
        this.parseMatchType(input.matchType ?? MatchType.CONTAINS),
      ),
      Promise.resolve(this.parseExpenseType(input.expenseType)),
      this.prisma.rule.aggregate({
        where: { userId },
        _max: {
          priority: true,
        },
      }),
    ]);

    if (
      input.accountId &&
      !(await this.prisma.account.findFirst({
        where: { id: input.accountId, userId },
      }))
    )
      throw new NotFoundException('Account not found');
    if (input.direction && !['IN', 'OUT'].includes(input.direction))
      throw new BadRequestException('Direction must be IN or OUT');
    return {
      accountId: input.accountId || null,
      direction: input.direction || null,
      merchantKey: input.merchantKey ? merchantKey(input.merchantKey) : null,
      userId,
      priority: input.priority ?? (maxPriority._max.priority ?? 0) + 10,
      matchType,
      pattern: pattern ?? '',
      vendor,
      category,
      subcategory: input.subcategory?.trim() || null,
      expenseType,
      isActive: true,
    };
  }

  private async applyBestMatchingRules(userId: string, rules: Rule[]) {
    const candidates = await this.prisma.transaction.findMany({
      where: { userId },
      include: {
        category: true,
      },
    });
    let updatedRows = 0;
    for (const transaction of candidates) {
      if (
        transaction.category?.isManual ||
        (transaction.category && transaction.category.expenseType !== 'REVIEW')
      )
        continue;
      const ordered = [
        ...rules.filter((r) => r.origin !== 'STARTER'),
        ...rules.filter((r) => r.origin === 'STARTER'),
      ];
      const rule = ordered.find((r) =>
        matchesRow(r, {
          ...transaction,
          moneyIn: Number(transaction.moneyIn),
          moneyOut: Number(transaction.moneyOut),
        }),
      );
      if (
        rule &&
        (await this.applyAutomatic(userId, transaction.id, rule, true))
      )
        updatedRows++;
    }
    return updatedRows;
  }

  private parseMatchType(matchType: string) {
    if (Object.values(MatchType).includes(matchType as MatchType)) {
      return matchType as MatchType;
    }

    throw new BadRequestException(`Unsupported matchType: ${matchType}`);
  }

  private parseExpenseType(expenseType: string) {
    if (Object.values(ExpenseType).includes(expenseType as ExpenseType)) {
      return expenseType as ExpenseType;
    }

    throw new BadRequestException(`Unsupported expenseType: ${expenseType}`);
  }
}
