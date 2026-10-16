import { z } from 'zod';
import { expenseWhere, parseInput } from '../expense-core/expense-validation';
import { ReviewService } from '../review/review.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseType, SourceType } from '../generated/prisma/client';
import type { TransactionWhereInput } from '../generated/prisma/models/Transaction';
import { PrismaService } from '../prisma/prisma.service';

export type TransactionFilters = {
  accountId?: string;
  accountIds?: string;
  from?: string;
  to?: string;
  reviewStatus?: string;
  confirmation?: string;
  limit?: string;
  cursor?: string;
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

  async findAll(userId: string, filters: TransactionFilters = {}) {
    const page = parseInput(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).optional(),
        cursor: z.string().optional(),
        reviewStatus: z
          .enum(['NEEDS_REVIEW', 'AUTO_ACCEPTED', 'USER_REVIEWED'])
          .optional(),
        confirmation: z.enum(['POSTED', 'UNCONFIRMED']).optional(),
      }),
      filters,
    );
    const where = this.buildWhere(userId, filters);
    if (page.reviewStatus) where.reviewStatus = page.reviewStatus;
    if (page.confirmation) where.confirmation = page.confirmation;
    if (page.cursor) {
      const cursor = await this.prisma.transaction.findFirst({
        where: { id: page.cursor, userId },
      });
      if (!cursor) throw new BadRequestException('Invalid cursor');
      where.AND = [
        {
          OR: [
            { transactionDate: { lt: cursor.transactionDate } },
            { transactionDate: cursor.transactionDate, id: { lt: cursor.id } },
          ],
        },
      ];
    }
    const rows = await this.prisma.transaction.findMany({
      where,
      include: {
        account: { omit: { statementPassword: true } },
        category: { include: { rule: true } },
      },
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      ...(page.limit ? { take: page.limit + 1 } : {}),
    });
    if (!page.limit) return rows;
    const items = rows.slice(0, page.limit);
    return {
      items,
      nextCursor: rows.length > page.limit ? items[items.length - 1].id : null,
    };
  }

  private buildWhere(userId: string, filters: TransactionFilters) {
    const where: TransactionWhereInput = { userId, ...expenseWhere(filters) };
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

  findReviewQueue(userId: string) {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        OR: [
          {
            category: {
              is: null,
            },
          },
          {
            reviewStatus: 'NEEDS_REVIEW',
          },
        ],
      },
      include: {
        account: { omit: { statementPassword: true } },
        category: true,
      },
      orderBy: {
        transactionDate: 'desc',
      },
    });
  }

  async findOne(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: {
        account: { omit: { statementPassword: true } },
        import: { omit: { rawFile: true } },
        observations: {
          include: { document: { omit: { encryptedBytes: true } } },
        },
        decisions: { orderBy: { createdAt: 'desc' } },
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

  async updateCategory(
    userId: string,
    id: string,
    input: UpdateTransactionCategoryInput,
  ) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
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

    const review = new ReviewService(this.prisma);
    const preview = await review.preview(userId, { ids: [id] });
    await review.apply(userId, {
      ids: [id],
      revisions: preview.revisions,
      overwriteManual: true,
      category: {
        vendor,
        category,
        subcategory: input.subcategory?.trim() || null,
        notes: input.notes,
        expenseType,
      },
    });
    return this.prisma.transactionCategory.findUnique({
      where: { transactionId: id },
      include: { transaction: true, rule: true },
    });
  }
}
