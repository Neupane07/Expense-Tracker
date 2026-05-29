import { ExpenseType, MatchType, SourceType } from '../generated/prisma/client';
import { defaultRules } from '../auth/default-financial-data';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from './rules.service';

type UpsertInput = {
  create: { expenseType: ExpenseType; ruleId: string | null };
  update: { expenseType: ExpenseType; ruleId: string | null };
};

describe('RulesService', () => {
  it('does not reclassify a card credit as expense when an expense rule is applied', async () => {
    const prisma = {
      rule: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'expense-rule',
          matchType: MatchType.CONTAINS,
          pattern: 'sanitized',
          vendor: 'Purchase',
          category: 'Purchase',
          subcategory: null,
          expenseType: ExpenseType.EXPENSE,
          isActive: true,
        }),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'transaction-credit',
            descriptionClean: 'SANITIZED CARD CREDIT',
            sourceType: SourceType.ICICI_AMAZON_PAY_CARD,
            moneyOut: { toNumber: () => 0 },
            moneyIn: { toNumber: () => 20 },
          },
        ]),
      },
      transactionCategory: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new RulesService(prisma as unknown as PrismaService);

    await service.apply('user-1', 'expense-rule');

    const calls = prisma.transactionCategory.upsert.mock
      .calls as unknown as UpsertInput[][];
    const input = calls[0][0];

    expect(input.create.expenseType).toBe(ExpenseType.REFUND);
    expect(input.create.ruleId).toBeNull();
    expect(input.update.expenseType).toBe(ExpenseType.REFUND);
    expect(input.update.ruleId).toBeNull();
  });

  it('rejects applying inactive rules to existing transactions', async () => {
    const prisma = {
      rule: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inactive-rule',
          isActive: false,
        }),
      },
      transaction: {
        findMany: jest.fn(),
      },
    };
    const service = new RulesService(prisma as unknown as PrismaService);

    await expect(service.apply('user-1', 'inactive-rule')).rejects.toThrow(
      'Inactive rules cannot be applied',
    );
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it('creates missing default rules and applies the best match to review rows only', async () => {
    const prisma = {
      rule: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ pattern: defaultRules[0].pattern }])
          .mockResolvedValueOnce(defaultRules),
        createMany: jest
          .fn()
          .mockResolvedValue({ count: defaultRules.length - 1 }),
        aggregate: jest.fn(),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'transaction-review',
            descriptionClean: 'salary received by neft',
            sourceType: SourceType.ICICI_BANK,
            moneyOut: { toNumber: () => 0 },
            moneyIn: { toNumber: () => 1000 },
            category: {
              expenseType: ExpenseType.REVIEW,
              isManual: false,
            },
          },
          {
            id: 'transaction-manual',
            descriptionClean: 'salary received by neft',
            sourceType: SourceType.ICICI_BANK,
            moneyOut: { toNumber: () => 0 },
            moneyIn: { toNumber: () => 1000 },
            category: {
              expenseType: ExpenseType.INCOME,
              isManual: true,
            },
          },
        ]),
      },
      transactionCategory: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new RulesService(prisma as unknown as PrismaService);

    const summary = await service.createDefaults('user-1');

    expect(summary.createdRules).toBe(defaultRules.length - 1);
    expect(summary.updatedRows).toBe(1);
    expect(prisma.transactionCategory.upsert).toHaveBeenCalledTimes(1);
  });
});
