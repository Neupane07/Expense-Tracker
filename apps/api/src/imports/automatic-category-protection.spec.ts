import { ExpenseType, SourceType } from '../generated/prisma/client';
import { getProtectedAutomaticCategory } from './automatic-category-protection';

describe('getProtectedAutomaticCategory', () => {
  it('protects card credits and refund-like debits from expense rules', () => {
    expect(
      getProtectedAutomaticCategory(
        {
          descriptionClean: 'SANITIZED CARD CREDIT',
          moneyOut: 0,
          moneyIn: 20,
          sourceType: SourceType.ICICI_AMAZON_PAY_CARD,
        },
        ExpenseType.EXPENSE,
      )?.expenseType,
    ).toBe(ExpenseType.REFUND);

    expect(
      getProtectedAutomaticCategory(
        {
          descriptionClean: 'SANITIZED MERCHANT REVERSAL',
          moneyOut: 20,
          moneyIn: 0,
          sourceType: SourceType.ICICI_AMAZON_PAY_CARD,
        },
        ExpenseType.EXPENSE,
      )?.expenseType,
    ).toBe(ExpenseType.REFUND);
  });

  it('does not let a bank account credit be automatically tagged expense', () => {
    expect(
      getProtectedAutomaticCategory(
        {
          descriptionClean: 'SANITIZED RECEIVED TRANSFER',
          moneyOut: 0,
          moneyIn: 500,
          sourceType: SourceType.ICICI_BANK,
        },
        ExpenseType.EXPENSE,
      )?.expenseType,
    ).toBe(ExpenseType.REVIEW);
  });
});
