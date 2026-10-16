export type Account = {
  id: string;
  name: string;
  institution: string;
  type: "BANK_ACCOUNT" | "CREDIT_CARD";
  openedAt?: string | null;
  closedAt?: string | null;
  archivedAt?: string | null;
  reviewEverything?: boolean;
  lastFour: string | null;
};

export type CreateAccountInput = {
  name: string;
  institution: string;
  type: Account["type"];
  lastFour?: string | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "ADMIN" | "MEMBER";
};

export type Invitation = {
  id: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
  usedAt: string | null;
  revokedAt: string | null;
};

export type ImportRecord = {
  id: string;
  fileName: string;
  sourceType: string;
  status: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  createdAt: string;
  account?: Account;
};

export type ImportDetail = ImportRecord & {
  transactions: Transaction[];
};

export type ImportPreviewRow = {
  transactionDate: string;
  descriptionRaw: string;
  descriptionClean: string;
  moneyOut: number;
  moneyIn: number;
  netAmount: number;
  balance: number | null;
  referenceNumber: string | null;
  paymentMethod: string | null;
  sourceType: string;
};

export type ImportPreview = {
  accountId: string;
  sourceType: string;
  rows: ImportPreviewRow[];
  stats: {
    totalRowsScanned: number;
    parsedRows: number;
    skippedRows: number;
    errors: string[];
  };
};

export type ImportSummary = {
  importId: string;
  accountId: string;
  sourceType: string;
  fileName: string;
  status: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  errors: string[];
};

export type Rule = {
  accountId?: string | null;
  direction?: string | null;
  merchantKey?: string | null;
  origin?: string;
  id: string;
  priority: number;
  matchType: string;
  pattern: string;
  vendor: string;
  category: string;
  subcategory: string | null;
  expenseType: string;
  isActive: boolean;
};

export type CreateRuleInput = {
  accountId?: string | null;
  direction?: string | null;
  merchantKey?: string | null;
  priority?: number;
  matchType: string;
  pattern: string;
  vendor: string;
  category: string;
  subcategory?: string | null;
  expenseType: string;
};

export type UpdateRuleInput = CreateRuleInput & {
  isActive: boolean;
};

export type RuleApplySummary = {
  ruleId: string;
  matchedRows: number;
  updatedRows: number;
};

export type DefaultRulesSummary = {
  createdRules: number;
  updatedRows: number;
};

export type TransactionCategory = {
  vendor: string;
  category: string;
  subcategory: string | null;
  expenseType: string;
  rule?: Rule | null;
};

export type Transaction = {
  reviewStatus?: string;
  reviewReason?: string | null;
  confirmation?: string;
  revision?: number;

  id: string;
  transactionDate: string;
  descriptionRaw: string;
  descriptionClean: string;
  moneyOut: string | number;
  moneyIn: string | number;
  sourceType: string;
  paymentMethod: string | null;
  account?: Account;
  category: TransactionCategory | null;
};

export type DashboardSummary = {
  confirmedExpense?: number;
  unconfirmedExpense?: number;
  possibleDuplicates?: number;
  unresolvedMoneyIn?: number;
  unresolvedMoneyOut?: number;

  totalExpense: number;
  bankExpense: number;
  creditCardExpense: number;
  transfersExcluded: number;
  investmentsExcluded: number;
  refunds: number;
  reviewAmount: number;
};

export type DashboardChartRow = {
  name: string;
  amount: number;
  percent?: number;
};

export type MonthlyTrendRow = {
  month: string;
  amount: number | null;
};

export type DashboardCharts = {
  coverageNote?: string;
  aggregation?: string;

  categorySpend: DashboardChartRow[];
  vendorSpend: DashboardChartRow[];
  sourceSpend: DashboardChartRow[];
  monthlyTrend: MonthlyTrendRow[];
};
