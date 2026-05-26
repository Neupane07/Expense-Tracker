import { ExpenseType, SourceType } from '../generated/prisma/client';

type MoneyValue = number | string | { toNumber(): number };

type AutomaticallyCategorizedRow = {
  descriptionClean: string;
  moneyOut: MoneyValue;
  moneyIn: MoneyValue;
  sourceType: SourceType;
};

export type ProtectedAutomaticCategory = {
  vendor: string;
  category: string;
  expenseType: ExpenseType;
  confidence: number;
  notes: string;
};

export function getProtectedAutomaticCategory(
  row: AutomaticallyCategorizedRow,
  proposedExpenseType?: ExpenseType,
): ProtectedAutomaticCategory | null {
  const moneyIn = numberFromMoney(row.moneyIn);
  const moneyOut = numberFromMoney(row.moneyOut);
  const refundLike =
    /\b(?:refund|cash\s*back|cashback|reversal|reversed|chargeback)\b/i.test(
      row.descriptionClean,
    );
  const cardCredit =
    row.sourceType === SourceType.ICICI_AMAZON_PAY_CARD && moneyIn > 0;

  if (refundLike || cardCredit) {
    return {
      vendor: 'Refund',
      category: 'Refund',
      expenseType: ExpenseType.REFUND,
      confidence: 100,
      notes: 'Automatically protected as a credit, cashback, or reversal.',
    };
  }

  if (
    proposedExpenseType === ExpenseType.EXPENSE &&
    moneyIn > 0 &&
    moneyOut === 0
  ) {
    return {
      vendor: 'Manual Review',
      category: 'Manual Review',
      expenseType: ExpenseType.REVIEW,
      confidence: 0,
      notes: 'Incoming credit cannot be automatically classified as expense.',
    };
  }

  return null;
}

function numberFromMoney(value: MoneyValue) {
  return typeof value === 'object' ? value.toNumber() : Number(value);
}
