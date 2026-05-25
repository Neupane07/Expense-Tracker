import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AccountType,
  ExpenseType,
  MatchType,
  PrismaClient,
} from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

const accounts = [
  {
    id: 'seed_icici_bank_account',
    name: 'ICICI Bank Account',
    institution: 'ICICI Bank',
    type: AccountType.BANK_ACCOUNT,
    lastFour: null,
  },
  {
    id: 'seed_icici_amazon_pay_card',
    name: 'ICICI Amazon Pay Credit Card',
    institution: 'ICICI Bank',
    type: AccountType.CREDIT_CARD,
    lastFour: null,
  },
];

const rules = [
  {
    id: 'seed_rule_credit_card_payment',
    priority: 10,
    matchType: MatchType.REGEX,
    pattern: 'cc billpay|credit card payment|card payment',
    vendor: 'Credit Card Payment',
    category: 'Transfer',
    expenseType: ExpenseType.TRANSFER,
  },
  {
    id: 'seed_rule_groceries',
    priority: 20,
    matchType: MatchType.REGEX,
    pattern: 'zepto|blinkit|bigbasket|dmart|jiomart',
    vendor: 'Groceries',
    category: 'Groceries',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    id: 'seed_rule_mobile_broadband',
    priority: 30,
    matchType: MatchType.REGEX,
    pattern: 'airtel|jio|vi prepaid|broadband',
    vendor: 'Utilities',
    category: 'Utilities',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    id: 'seed_rule_drinkprime',
    priority: 40,
    matchType: MatchType.CONTAINS,
    pattern: 'drinkprime',
    vendor: 'DrinkPrime',
    category: 'Utilities',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    id: 'seed_rule_fuel',
    priority: 50,
    matchType: MatchType.REGEX,
    pattern: 'petrol|fuel|iocl|hpcl|bharat petroleum|shell',
    vendor: 'Fuel',
    category: 'Fuel',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    id: 'seed_rule_food_outside',
    priority: 60,
    matchType: MatchType.REGEX,
    pattern: 'swiggy|zomato|restaurant|cafe',
    vendor: 'Food Outside',
    category: 'Food Outside',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    id: 'seed_rule_shopping',
    priority: 70,
    matchType: MatchType.REGEX,
    pattern: 'amazon|flipkart|myntra|ajio',
    vendor: 'Shopping',
    category: 'Shopping',
    expenseType: ExpenseType.EXPENSE,
  },
  {
    id: 'seed_rule_investment',
    priority: 80,
    matchType: MatchType.REGEX,
    pattern: 'groww|zerodha|mutual fund|sip',
    vendor: 'Investment',
    category: 'Investment',
    expenseType: ExpenseType.INVESTMENT,
  },
  {
    id: 'seed_rule_refund',
    priority: 90,
    matchType: MatchType.REGEX,
    pattern: 'refund|cashback|reversal',
    vendor: 'Refund',
    category: 'Refund',
    expenseType: ExpenseType.REFUND,
  },
  {
    id: 'seed_rule_manual_review',
    priority: 1000,
    matchType: MatchType.REGEX,
    pattern: 'upi|imps|neft|inft',
    vendor: 'Manual Review',
    category: 'Manual Review',
    expenseType: ExpenseType.REVIEW,
  },
];

async function main() {
  for (const account of accounts) {
    await prisma.account.upsert({
      where: { id: account.id },
      create: account,
      update: {
        name: account.name,
        institution: account.institution,
        type: account.type,
        lastFour: account.lastFour,
      },
    });
  }

  for (const rule of rules) {
    await prisma.rule.upsert({
      where: { id: rule.id },
      create: rule,
      update: {
        priority: rule.priority,
        matchType: rule.matchType,
        pattern: rule.pattern,
        vendor: rule.vendor,
        category: rule.category,
        expenseType: rule.expenseType,
        isActive: true,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
