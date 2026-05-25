import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountType, ExpenseType } from '../generated/prisma/client';
import type { TransactionWhereInput } from '../generated/prisma/models/Transaction';
import { PrismaService } from '../prisma/prisma.service';

type DecimalLike = {
  toNumber(): number;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(month?: string) {
    const dateWhere = this.buildDateWhere(month);
    const [
      expense,
      transfer,
      investment,
      refund,
      review,
      bankExpense,
      creditCardExpense,
    ] = await Promise.all([
      this.sumByExpenseType(ExpenseType.EXPENSE, dateWhere),
      this.sumByExpenseType(ExpenseType.TRANSFER, dateWhere),
      this.sumByExpenseType(ExpenseType.INVESTMENT, dateWhere),
      this.sumByExpenseType(ExpenseType.REFUND, dateWhere),
      this.sumByExpenseType(ExpenseType.REVIEW, dateWhere),
      this.sumExpenseByAccountType(AccountType.BANK_ACCOUNT, dateWhere),
      this.sumExpenseByAccountType(AccountType.CREDIT_CARD, dateWhere),
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

  async getCharts() {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        category: {
          is: {
            expenseType: ExpenseType.EXPENSE,
          },
        },
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: {
        transactionDate: 'asc',
      },
    });
    const categorySpend = new Map<string, number>();
    const vendorSpend = new Map<string, number>();
    const sourceSpend = new Map<string, number>();
    const monthlyTrend = new Map<string, number>();

    transactions.forEach((transaction) => {
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
      this.addAmount(
        monthlyTrend,
        this.monthKey(transaction.transactionDate),
        amount,
      );
    });

    return {
      categorySpend: this.toSortedChartRows(categorySpend),
      vendorSpend: this.toSortedChartRows(vendorSpend).slice(0, 15),
      sourceSpend: this.toSortedChartRows(sourceSpend),
      monthlyTrend: this.toMonthlyRows(monthlyTrend),
    };
  }

  private async sumExpenseByAccountType(
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

  private buildDateWhere(month?: string) {
    if (!month) {
      return {};
    }

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

  private decimalToNumber(value: DecimalLike | null | undefined) {
    return value?.toNumber() ?? 0;
  }

  private addAmount(map: Map<string, number>, key: string, amount: number) {
    map.set(key, (map.get(key) ?? 0) + amount);
  }

  private toSortedChartRows(map: Map<string, number>) {
    return Array.from(map.entries())
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((left, right) => right.amount - left.amount);
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
