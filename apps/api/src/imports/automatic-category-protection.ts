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

  const repayment =
    /\b(?:cc billpay|credit card payment|card payment|payment received|payment thank you|payment received thank you)\b/i.test(
      row.descriptionClean,
    );
  if (
    repayment &&
    (row.sourceType === SourceType.ICICI_AMAZON_PAY_CARD
      ? moneyIn > 0
      : moneyOut > 0)
  ) {
    return {
      vendor: 'Credit Card Payment',
      category: 'Transfer',
      expenseType: ExpenseType.TRANSFER,
      confidence: 100,
      notes: 'Card repayment; purchases are counted separately.',
    };
  }
  if (refundLike && moneyIn > 0 && moneyOut === 0) {
    return {
      vendor: 'Refund',
      category: 'Refund',
      expenseType: ExpenseType.REFUND,
      confidence: 100,
      notes: 'Automatically protected as a credit, cashback, or reversal.',
    };
  }

  if (refundLike && moneyOut > 0)
    return {
      vendor: 'Unknown',
      category: 'Uncategorized',
      expenseType: ExpenseType.REVIEW,
      confidence: 0,
      notes: 'Outgoing reversal needs review of the original event.',
    };

  if (
    cardCredit &&
    (!proposedExpenseType ||
      proposedExpenseType === ExpenseType.EXPENSE ||
      proposedExpenseType === ExpenseType.REVIEW)
  )
    return {
      vendor: 'Unknown',
      category: 'Uncategorized',
      expenseType: ExpenseType.REVIEW,
      confidence: 0,
      notes: 'Card credit needs repayment or refund evidence.',
    };

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
