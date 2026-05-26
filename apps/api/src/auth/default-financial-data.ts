import {
  AccountType,
  ExpenseType,
  MatchType,
} from '../generated/prisma/client';

export const defaultAccounts = [
  {
    name: 'ICICI Bank Account',
    institution: 'ICICI Bank',
    type: AccountType.BANK_ACCOUNT,
    lastFour: null,
  },
  {
    name: 'ICICI Amazon Pay Credit Card',
    institution: 'ICICI Bank',
    type: AccountType.CREDIT_CARD,
    lastFour: null,
  },
] as const;

export const defaultRules = [
  {
    priority: 10,
    matchType: MatchType.REGEX,
    pattern: 'cc billpay|credit card payment|card payment',
    vendor: 'Credit Card Payment',
    category: 'Transfer',
    expenseType: ExpenseType.TRANSFER,
  },
  {
    priority: 20,
    matchType: MatchType.REGEX,
    pattern: 'zepto|blinkit|bigbasket|dmart|jiomart',
    vendor: 'Groceries',
    category: 'Groceries',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    priority: 30,
    matchType: MatchType.REGEX,
    pattern: 'airtel|jio|vi prepaid|broadband',
    vendor: 'Utilities',
    category: 'Utilities',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    priority: 40,
    matchType: MatchType.CONTAINS,
    pattern: 'drinkprime',
    vendor: 'DrinkPrime',
    category: 'Utilities',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    priority: 50,
    matchType: MatchType.REGEX,
    pattern: 'petrol|fuel|iocl|hpcl|bharat petroleum|shell',
    vendor: 'Fuel',
    category: 'Fuel',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    priority: 60,
    matchType: MatchType.REGEX,
    pattern: 'swiggy|zomato|restaurant|cafe',
    vendor: 'Food Outside',
    category: 'Food Outside',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    priority: 70,
    matchType: MatchType.REGEX,
    pattern: 'amazon|flipkart|myntra|ajio',
    vendor: 'Shopping',
    category: 'Shopping',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    priority: 80,
    matchType: MatchType.REGEX,
    pattern: 'groww|zerodha|mutual fund|sip',
    vendor: 'Investment',
    category: 'Investment',
    expenseType: ExpenseType.INVESTMENT,
  },
  {
    priority: 90,
    matchType: MatchType.REGEX,
    pattern: 'refund|cashback|reversal',
    vendor: 'Refund',
    category: 'Refund',
    expenseType: ExpenseType.REFUND,
  },
  {
    priority: 1000,
    matchType: MatchType.REGEX,
    pattern: 'upi|imps|neft|inft',
    vendor: 'Manual Review',
    category: 'Manual Review',
    expenseType: ExpenseType.REVIEW,
  },
] as const;
