import { ExpenseType, MatchType, SourceType } from '../generated/prisma/client';
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
});
