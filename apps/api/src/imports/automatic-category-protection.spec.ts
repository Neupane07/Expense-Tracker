import { ExpenseType, SourceType } from '../generated/prisma/client';
import { getProtectedAutomaticCategory } from './automatic-category-protection';

describe('getProtectedAutomaticCategory', () => {
  it('reviews unexplained card credits and protects explicit reversals', () => {
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
    ).toBe(ExpenseType.REVIEW);

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
    ).toBe(ExpenseType.REVIEW);
  });

  it('protects incoming refunds and does not treat a utility bill as a card repayment', () => {
    expect(
      getProtectedAutomaticCategory({
        descriptionClean: 'MERCHANT REFUND',
        moneyOut: 0,
        moneyIn: 20,
        sourceType: SourceType.ICICI_AMAZON_PAY_CARD,
      })?.expenseType,
    ).toBe(ExpenseType.REFUND);
    expect(
      getProtectedAutomaticCategory({
        descriptionClean: 'ELECTRICITY BILL PAYMENT',
        moneyOut: 500,
        moneyIn: 0,
        sourceType: SourceType.ICICI_BANK,
      }),
    ).toBeNull();
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
