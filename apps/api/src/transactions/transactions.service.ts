import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseType, SourceType } from '../generated/prisma/client';
import type { TransactionWhereInput } from '../generated/prisma/models/Transaction';
import { PrismaService } from '../prisma/prisma.service';

export type TransactionFilters = {
  month?: string;
  sourceType?: string;
  expenseType?: string;
  category?: string;
  search?: string;
};

export type UpdateTransactionCategoryInput = {
  vendor?: string;
  category?: string;
  subcategory?: string | null;
  expenseType?: string;
  notes?: string | null;
};

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: TransactionFilters = {}) {
    return this.prisma.transaction.findMany({
      where: this.buildWhere(filters),
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

  private buildWhere(filters: TransactionFilters) {
    const where: TransactionWhereInput = {};
    const categoryFilters: NonNullable<
      TransactionWhereInput['category']
    >['is'] = {};

    if (filters.month) {
      where.transactionDate = this.getMonthDateRange(filters.month);
    }

    if (filters.sourceType) {
      where.sourceType = this.parseSourceType(filters.sourceType);
    }

    if (filters.expenseType) {
      categoryFilters.expenseType = this.parseExpenseType(filters.expenseType);
    }

    if (filters.category) {
      categoryFilters.category = filters.category;
    }

    const search = filters.search?.trim();

    if (search) {
      where.OR = [
        {
          descriptionRaw: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          descriptionClean: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          referenceNumber: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          category: {
            is: {
              OR: [
                {
                  vendor: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  category: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          },
        },
      ];
    }

    if (Object.keys(categoryFilters).length > 0) {
      where.category = {
        is: categoryFilters,
      };
    }

    return where;
  }

  private getMonthDateRange(month: string) {
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
      gte: new Date(Date.UTC(year, monthIndex, 1)),
      lt: new Date(Date.UTC(year, monthIndex + 1, 1)),
    };
  }

  private parseSourceType(sourceType: string) {
    if (this.isSourceType(sourceType)) {
      return sourceType;
    }

    throw new BadRequestException(`Unsupported sourceType: ${sourceType}`);
  }

  private parseExpenseType(expenseType: string) {
    if (this.isExpenseType(expenseType)) {
      return expenseType;
    }

    throw new BadRequestException(`Unsupported expenseType: ${expenseType}`);
  }

  private isSourceType(sourceType: string): sourceType is SourceType {
    return Object.values(SourceType).includes(sourceType as SourceType);
  }

  private isExpenseType(expenseType: string): expenseType is ExpenseType {
    return Object.values(ExpenseType).includes(expenseType as ExpenseType);
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

  async updateCategory(id: string, input: UpdateTransactionCategoryInput) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} was not found`);
    }

    const vendor = input.vendor?.trim();
    const category = input.category?.trim();

    if (!vendor) {
      throw new BadRequestException('vendor is required');
    }

    if (!category) {
      throw new BadRequestException('category is required');
    }

    if (!input.expenseType) {
      throw new BadRequestException('expenseType is required');
    }

    const expenseType = this.parseExpenseType(input.expenseType);

    return this.prisma.transactionCategory.upsert({
      where: {
        transactionId: id,
      },
      create: {
        transactionId: id,
        vendor,
        category,
        subcategory: input.subcategory?.trim() || null,
        expenseType,
        confidence: 100,
        isManual: true,
        notes: input.notes?.trim() || null,
      },
      update: {
        vendor,
        category,
        subcategory: input.subcategory?.trim() || null,
        expenseType,
        ruleId: null,
        confidence: 100,
        isManual: true,
        notes: input.notes?.trim() || null,
      },
      include: {
        transaction: true,
        rule: true,
      },
    });
  }
}
