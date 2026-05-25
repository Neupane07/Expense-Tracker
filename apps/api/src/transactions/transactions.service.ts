import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.transaction.findMany({
      include: {
        account: true,
        category: {
          include: {
            rule: true,
          },
        },
      },
      orderBy: {
        transactionDate: 'desc',
      },
    });
  }

  findReviewQueue() {
    return this.prisma.transaction.findMany({
      where: {
        OR: [
          {
            category: {
              is: null,
            },
          },
          {
            category: {
              is: {
                expenseType: ExpenseType.REVIEW,
              },
            },
          },
        ],
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: {
        transactionDate: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        account: true,
        import: true,
        category: {
          include: {
            rule: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} was not found`);
    }

    return transaction;
  }
}
