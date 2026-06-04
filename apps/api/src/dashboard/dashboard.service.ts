import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountType, ExpenseType } from '../generated/prisma/client';
import type { TransactionWhereInput } from '../generated/prisma/models/Transaction';
import { PrismaService } from '../prisma/prisma.service';

type DecimalLike = {
  toNumber(): number;
};

export type DashboardPeriodInput = {
  month?: string;
  from?: string;
  to?: string;
};

const TREND_MONTHS = 12;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, period: DashboardPeriodInput) {
    const dateWhere = this.buildDateWhere(period);
    const [
      expense,
      transfer,
      investment,
      refund,
      review,
      bankExpense,
      creditCardExpense,
    ] = await Promise.all([
      this.sumByExpenseType(userId, ExpenseType.EXPENSE, dateWhere),
      this.sumByExpenseType(userId, ExpenseType.TRANSFER, dateWhere),
      this.sumByExpenseType(userId, ExpenseType.INVESTMENT, dateWhere),
      this.sumByExpenseType(userId, ExpenseType.REFUND, dateWhere),
      this.sumByExpenseType(userId, ExpenseType.REVIEW, dateWhere),
      this.sumExpenseByAccountType(userId, AccountType.BANK_ACCOUNT, dateWhere),
      this.sumExpenseByAccountType(userId, AccountType.CREDIT_CARD, dateWhere),
    ]);

    return {
      totalExpense: expense.moneyOut,
      bankExpense: bankExpense.moneyOut,
      creditCardExpense: creditCardExpense.moneyOut,
      transfersExcluded: transfer.moneyOut,
      investmentsExcluded: investment.moneyOut,
      refunds: refund.moneyIn,
      reviewAmount: review.moneyOut,
    };
  }

  async getCharts(userId: string, period: DashboardPeriodInput) {
    const dateWhere = this.buildDateWhere(period);
    const expenseFilter: TransactionWhereInput = {
      userId,
      category: {
        is: {
          expenseType: ExpenseType.EXPENSE,
        },
      },
    };

    const [periodTransactions, trendTransactions] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { ...expenseFilter, ...dateWhere },
        include: { account: true, category: true },
      }),
      this.prisma.transaction.findMany({
        where: { ...expenseFilter, ...this.buildTrendDateWhere() },
        include: { category: true },
      }),
    ]);

    const categorySpend = new Map<string, number>();
    const vendorSpend = new Map<string, number>();
    const sourceSpend = new Map<string, number>();
    const monthlyTrend = new Map<string, number>();

    periodTransactions.forEach((transaction) => {
      const amount = this.decimalToNumber(transaction.moneyOut);

      this.addAmount(
        categorySpend,
        transaction.category?.category ?? 'Uncategorized',
        amount,
      );
      this.addAmount(
        vendorSpend,
        transaction.category?.vendor ?? 'Unknown',
        amount,
      );
      this.addAmount(sourceSpend, transaction.sourceType, amount);
    });

    trendTransactions.forEach((transaction) => {
      const amount = this.decimalToNumber(transaction.moneyOut);
      this.addAmount(
        monthlyTrend,
        this.monthKey(transaction.transactionDate),
        amount,
      );
    });

    return {
      categorySpend: this.toSortedChartRowsWithPercent(categorySpend),
      vendorSpend: this.toSortedChartRowsWithPercent(vendorSpend).slice(0, 15),
      sourceSpend: this.toSortedChartRowsWithPercent(sourceSpend),
      monthlyTrend: this.toMonthlyRows(monthlyTrend),
    };
  }

  private async sumExpenseByAccountType(
    userId: string,
    accountType: AccountType,
    dateWhere: TransactionWhereInput,
  ) {
    const aggregate = await this.prisma.transaction.aggregate({
      _sum: {
        moneyOut: true,
        moneyIn: true,
      },
      where: {
        ...dateWhere,
        userId,
        account: {
          type: accountType,
        },
        category: {
          is: {
            expenseType: ExpenseType.EXPENSE,
          },
        },
      },
    });

    return {
      moneyOut: this.decimalToNumber(aggregate._sum.moneyOut),
      moneyIn: this.decimalToNumber(aggregate._sum.moneyIn),
    };
  }

  private async sumByExpenseType(
    userId: string,
    expenseType: ExpenseType,
    dateWhere: TransactionWhereInput,
  ) {
    const aggregate = await this.prisma.transaction.aggregate({
      _sum: {
        moneyOut: true,
        moneyIn: true,
      },
      where: {
        ...dateWhere,
        userId,
        category: {
          is: {
            expenseType,
          },
        },
      },
    });

    return {
      moneyOut: this.decimalToNumber(aggregate._sum.moneyOut),
      moneyIn: this.decimalToNumber(aggregate._sum.moneyIn),
    };
  }

  private buildDateWhere(period: DashboardPeriodInput): TransactionWhereInput {
    const { month, from, to } = period;
    const hasRange = Boolean(from || to);

    if (month && hasRange) {
      throw new BadRequestException('Use either month or from/to, not both');
    }

    if (month) {
      return this.monthDateWhere(month);
    }

    if (hasRange) {
      return this.rangeDateWhere(from, to);
    }

    return {};
  }

  private monthDateWhere(month: string): TransactionWhereInput {
    const match = /^(\d{4})-(\d{2})$/.exec(month);

    if (!match) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
      throw new BadRequestException('month must be in YYYY-MM format');
    }

    return {
      transactionDate: {
        gte: new Date(Date.UTC(year, monthIndex, 1)),
        lt: new Date(Date.UTC(year, monthIndex + 1, 1)),
      },
    };
  }

  private rangeDateWhere(
    from: string | undefined,
    to: string | undefined,
  ): TransactionWhereInput {
    const fromDate = from ? this.parseIsoDate(from, 'from') : null;
    const toDate = to ? this.parseIsoDate(to, 'to') : null;

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('from must be on or before to');
    }

    const transactionDate: { gte?: Date; lt?: Date } = {};
    if (fromDate) {
      transactionDate.gte = fromDate;
    }
    if (toDate) {
      transactionDate.lt = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
    }

    return { transactionDate };
  }

  private parseIsoDate(value: string, label: 'from' | 'to'): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException(`${label} must be in YYYY-MM-DD format`);
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, monthIndex, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== monthIndex ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${label} must be a valid date`);
    }

    return date;
  }

  private buildTrendDateWhere(): TransactionWhereInput {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS - 1), 1),
    );

    return { transactionDate: { gte: start } };
  }

  private decimalToNumber(value: DecimalLike | null | undefined) {
    return value?.toNumber() ?? 0;
  }

  private addAmount(map: Map<string, number>, key: string, amount: number) {
    map.set(key, (map.get(key) ?? 0) + amount);
  }

  private toSortedChartRowsWithPercent(map: Map<string, number>) {
    const rows = Array.from(map.entries())
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((left, right) => right.amount - left.amount);

    const total = rows.reduce((sum, row) => sum + row.amount, 0);

    return rows.map((row) => ({
      ...row,
      percent: total > 0 ? Math.round((row.amount / total) * 1000) / 10 : 0,
    }));
  }

  private toMonthlyRows(map: Map<string, number>) {
    return Array.from(map.entries())
      .map(([month, amount]) => ({
        month,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((left, right) => left.month.localeCompare(right.month));
  }

  private monthKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }
}
