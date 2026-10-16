import {
  expenseWhere,
  ExpensePeriod,
} from '../expense-core/expense-validation';
import { Injectable } from '@nestjs/common';
import { AccountType, ExpenseType } from '../generated/prisma/client';
import type { TransactionWhereInput } from '../generated/prisma/models/Transaction';
import { PrismaService } from '../prisma/prisma.service';

type DecimalLike = {
  toNumber(): number;
};

export type DashboardPeriodInput = ExpensePeriod;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, period: DashboardPeriodInput) {
    const dateWhere = { ...expenseWhere(period), currency: 'INR' };
    const accountIds = [
      ...new Set([
        ...(period.accountIds?.split(',').filter(Boolean) ?? []),
        ...(period.accountId ? [period.accountId] : []),
      ]),
    ];
    const [
      expense,
      transfer,
      investment,
      refund,
      review,
      bankExpense,
      creditCardExpense,
      confirmed,
      unconfirmed,
      pendingObservations,
    ] = await Promise.all([
      this.sumByExpenseType(userId, ExpenseType.EXPENSE, dateWhere),
      this.sumByExpenseType(userId, ExpenseType.TRANSFER, dateWhere),
      this.sumByExpenseType(userId, ExpenseType.INVESTMENT, dateWhere),
      this.sumByExpenseType(userId, ExpenseType.REFUND, dateWhere),
      this.sumByExpenseType(userId, ExpenseType.REVIEW, dateWhere),
      this.sumExpenseByAccountType(userId, AccountType.BANK_ACCOUNT, dateWhere),
      this.sumExpenseByAccountType(userId, AccountType.CREDIT_CARD, dateWhere),
      this.sumByExpenseType(userId, ExpenseType.EXPENSE, {
        ...dateWhere,
        confirmation: 'POSTED',
      }),
      this.sumByExpenseType(userId, ExpenseType.EXPENSE, {
        ...dateWhere,
        confirmation: 'UNCONFIRMED',
      }),
      this.prisma.sourceObservation.findMany({
        select: { parsed: true, status: true },
        where: {
          userId,
          transactionId: null,
          status: { in: ['PENDING', 'NEEDS_MATCH'] },
          AND: [
            ...(period.from
              ? [{ parsed: { path: ['transactionDate'], gte: period.from } }]
              : []),
            ...(period.to
              ? [{ parsed: { path: ['transactionDate'], lte: period.to } }]
              : []),
            ...(period.month
              ? [
                  {
                    parsed: {
                      path: ['transactionDate'],
                      string_starts_with: period.month,
                    },
                  },
                ]
              : []),
          ],
          document: {
            deletedAt: null,
            ...(accountIds.length ? { accountId: { in: accountIds } } : {}),
          },
        },
      }),
    ]);

    const held = pendingObservations.reduce(
      (sum, observation) => {
        const row = observation.parsed as {
          moneyOut?: number;
          moneyIn?: number;
          currency?: string;
        };
        if (row.currency === 'INR') {
          sum.moneyOut += Math.round((row.moneyOut ?? 0) * 100);
          sum.moneyIn += Math.round((row.moneyIn ?? 0) * 100);
        }
        return sum;
      },
      { moneyIn: 0, moneyOut: 0 },
    );
    return {
      unresolvedMoneyOut: review.moneyOut + held.moneyOut / 100,
      unresolvedMoneyIn: review.moneyIn + held.moneyIn / 100,
      totalExpense: expense.moneyOut,
      confirmedExpense: confirmed.moneyOut,
      unconfirmedExpense: unconfirmed.moneyOut,
      possibleDuplicates: pendingObservations.filter(
        (o) => o.status === 'NEEDS_MATCH',
      ).length,
      bankExpense: bankExpense.moneyOut,
      creditCardExpense: creditCardExpense.moneyOut,
      transfersExcluded: transfer.moneyOut,
      investmentsExcluded: investment.moneyOut,
      refunds: refund.moneyIn,
      reviewAmount: review.moneyOut,
    };
  }

  async getCharts(userId: string, period: DashboardPeriodInput) {
    const dateWhere = { ...expenseWhere(period), currency: 'INR' };
    const expenseFilter: TransactionWhereInput = {
      userId,
      category: {
        is: {
          expenseType: ExpenseType.EXPENSE,
        },
      },
    };

    const periodTransactions = await this.prisma.transaction.findMany({
      where: { ...expenseFilter, ...dateWhere },
      include: { category: true },
    });
    const trendTransactions = periodTransactions;

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

    const dates = trendTransactions.map((t) => t.transactionDate.getTime());
    const start = period.month
      ? new Date(`${period.month}-01`).getTime()
      : period.from
        ? new Date(period.from).getTime()
        : dates.reduce((n, v) => Math.min(n, v), dates[0] ?? Date.now());
    const end = period.month
      ? start
      : period.to
        ? new Date(period.to).getTime()
        : dates.reduce((n, v) => Math.max(n, v), dates[0] ?? Date.now());
    const yearly =
      period.aggregation === 'year' ||
      (period.aggregation !== 'month' && end - start > 5 * 365.25 * 86400000);
    trendTransactions.forEach((transaction) => {
      const amount = this.decimalToNumber(transaction.moneyOut);
      this.addAmount(
        monthlyTrend,
        yearly
          ? String(transaction.transactionDate.getUTCFullYear())
          : this.monthKey(transaction.transactionDate),
        amount,
      );
    });

    const trend: { month: string; amount: number | null }[] = [];
    const cursor = new Date(start);
    cursor.setUTCDate(1);
    if (yearly) cursor.setUTCMonth(0);
    while (cursor.getTime() <= end && trend.length < 1200) {
      const key = yearly
        ? String(cursor.getUTCFullYear())
        : this.monthKey(cursor);
      trend.push({
        month: key,
        amount: monthlyTrend.has(key)
          ? Math.round(monthlyTrend.get(key)! * 100) / 100
          : null,
      });
      if (yearly) cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return {
      categorySpend: this.toSortedChartRowsWithPercent(categorySpend),
      vendorSpend: this.toSortedChartRowsWithPercent(vendorSpend).slice(0, 15),
      sourceSpend: this.toSortedChartRowsWithPercent(sourceSpend),
      monthlyTrend: trend,
      aggregation: yearly ? 'year' : 'month',
      coverageNote:
        'Observed activity only; missing statement periods are not zero spending. See account coverage.',
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

  private monthKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }
}
