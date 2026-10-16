import { ExpenseType, Rule, SourceType } from '../generated/prisma/client';
import { getProtectedAutomaticCategory } from '../imports/automatic-category-protection';
import { merchantKey } from './expense-validation';
export type Classifiable = {
  accountId: string;
  sourceType: SourceType;
  descriptionClean: string;
  moneyOut: number;
  moneyIn: number;
  merchantKey?: string | null;
};
export function ruleMatches(
  rule: Pick<Rule, 'pattern' | 'matchType'> & Partial<Rule>,
  row: Classifiable,
) {
  if (rule.accountId && rule.accountId !== row.accountId) return false;
  if (rule.direction && rule.direction !== (row.moneyOut > 0 ? 'OUT' : 'IN'))
    return false;
  if (
    rule.merchantKey &&
    rule.merchantKey !== (row.merchantKey ?? merchantKey(row.descriptionClean))
  )
    return false;
  const text = row.descriptionClean.toLowerCase(),
    pattern = rule.pattern.toLowerCase();
  switch (rule.matchType) {
    case 'EXACT':
      return text === pattern;
    case 'STARTS_WITH':
      return text.startsWith(pattern);
    case 'CONTAINS':
      return text.includes(pattern);
    case 'REGEX':
      try {
        return new RegExp(rule.pattern, 'i').test(text);
      } catch {
        return false;
      }
  }
}
export function classify(row: Classifiable, rules: Rule[]) {
  const rule =
    rules.find((r) => r.origin !== 'STARTER' && ruleMatches(r, row)) ??
    rules.find((r) => ruleMatches(r, row));
  const protectedValue = getProtectedAutomaticCategory(row, rule?.expenseType);
  if (protectedValue)
    return {
      ...protectedValue,
      subcategory: null,
      ruleId: null,
      isManual: false,
    };
  if (rule)
    return {
      vendor: rule.vendor,
      category: rule.category,
      subcategory: rule.subcategory,
      expenseType: rule.expenseType,
      ruleId: rule.id,
      confidence: rule.expenseType === 'REVIEW' ? 0 : 100,
      isManual: false,
      notes: 'Matched user rule.',
    };
  return {
    vendor: 'Unknown',
    category: 'Uncategorized',
    subcategory: null,
    expenseType: ExpenseType.REVIEW,
    ruleId: null,
    confidence: 0,
    isManual: false,
    notes: 'No matching rule.',
  };
}
