import { Injectable } from '@nestjs/common';
import { AccountType, ExpenseType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DecimalLike = {
  toNumber(): number;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [
      expense,
      transfer,
      investment,
      income,
      refund,
      review,
      bankExpense,
      creditCardExpense,
      uncategorizedCount,
    ] = await Promise.all([
      this.sumByExpenseType(ExpenseType.EXPENSE),
      this.sumByExpenseType(ExpenseType.TRANSFER),
      this.sumByExpenseType(ExpenseType.INVESTMENT),
      this.sumByExpenseType(ExpenseType.INCOME),
      this.sumByExpenseType(ExpenseType.REFUND),
      this.sumByExpenseType(ExpenseType.REVIEW),
      this.sumExpenseByAccountType(AccountType.BANK_ACCOUNT),
      this.sumExpenseByAccountType(AccountType.CREDIT_CARD),
      this.prisma.transaction.count({
        where: {
          category: {
            is: null,
          },
        },
      }),
    ]);

    return {
      totalActualExpense: expense.moneyOut,
      bankUpiExpense: bankExpense.moneyOut,
      creditCardExpense: creditCardExpense.moneyOut,
      transfersExcluded: transfer.moneyOut,
      investmentsExcluded: investment.moneyOut,
      income: income.moneyIn,
      refunds: refund.moneyIn,
      reviewAmount: review.moneyOut,
      reviewCount: review.count,
      uncategorizedCount,
    };
  }

  private async sumExpenseByAccountType(accountType: AccountType) {
    const aggregate = await this.prisma.transaction.aggregate({
      _sum: {
        moneyOut: true,
        moneyIn: true,
      },
      where: {
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

  private async sumByExpenseType(expenseType: ExpenseType) {
    const [aggregate, count] = await Promise.all([
      this.prisma.transaction.aggregate({
        _sum: {
          moneyOut: true,
          moneyIn: true,
        },
        where: {
          category: {
            is: {
              expenseType,
            },
          },
        },
      }),
      this.prisma.transaction.count({
        where: {
          category: {
            is: {
              expenseType,
            },
          },
        },
      }),
    ]);

    return {
      count,
      moneyOut: this.decimalToNumber(aggregate._sum.moneyOut),
      moneyIn: this.decimalToNumber(aggregate._sum.moneyIn),
    };
  }

  private decimalToNumber(value: DecimalLike | null | undefined) {
    return value?.toNumber() ?? 0;
  }
}
