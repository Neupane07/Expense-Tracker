export type Account = {
  id: string
  name: string
  institution: string
  type: "BANK_ACCOUNT" | "CREDIT_CARD"
  lastFour: string | null
}

export type ImportRecord = {
  id: string
  fileName: string
  sourceType: string
  status: string
  totalRows: number
  importedRows: number
  duplicateRows: number
  failedRows: number
  createdAt: string
  account?: Account
}

export type Rule = {
  id: string
  priority: number
  matchType: string
  pattern: string
  vendor: string
  category: string
  subcategory: string | null
  expenseType: string
  isActive: boolean
}

export type TransactionCategory = {
  vendor: string
  category: string
  subcategory: string | null
  expenseType: string
  rule?: Rule | null
}

export type Transaction = {
  id: string
  transactionDate: string
  descriptionRaw: string
  moneyOut: string | number
  moneyIn: string | number
  sourceType: string
  paymentMethod: string | null
  account?: Account
  category: TransactionCategory | null
}

export type DashboardSummary = {
  totalExpense: number
  bankExpense: number
  creditCardExpense: number
  transfersExcluded: number
  investmentsExcluded: number
  refunds: number
  reviewAmount: number
}
