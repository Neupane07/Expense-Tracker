import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseType, MatchType, Rule } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateRuleInput = {
  priority?: number;
  matchType?: string;
  pattern?: string;
  vendor?: string;
  category?: string;
  subcategory?: string | null;
  expenseType?: string;
};

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.rule.findMany({
      orderBy: [
        {
          priority: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            categories: true,
          },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${id} was not found`);
    }

    return rule;
  }

  async create(input: CreateRuleInput) {
    const pattern = input.pattern?.trim();
    const vendor = input.vendor?.trim();
    const category = input.category?.trim();

    if (!pattern) {
      throw new BadRequestException('pattern is required');
    }

    if (!vendor) {
      throw new BadRequestException('vendor is required');
    }

    if (!category) {
      throw new BadRequestException('category is required');
    }

    if (!input.expenseType) {
      throw new BadRequestException('expenseType is required');
    }

    const [matchType, expenseType, maxPriority] = await Promise.all([
      Promise.resolve(
        this.parseMatchType(input.matchType ?? MatchType.CONTAINS),
      ),
      Promise.resolve(this.parseExpenseType(input.expenseType)),
      this.prisma.rule.aggregate({
        _max: {
          priority: true,
        },
      }),
    ]);

    return this.prisma.rule.create({
      data: {
        priority: input.priority ?? (maxPriority._max.priority ?? 0) + 10,
        matchType,
        pattern,
        vendor,
        category,
        subcategory: input.subcategory?.trim() || null,
        expenseType,
        isActive: true,
      },
    });
  }

  async apply(id: string) {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${id} was not found`);
    }

    const candidates = await this.prisma.transaction.findMany({
      include: {
        category: true,
      },
    });
    const matchingTransactions = candidates.filter((transaction) =>
      this.ruleMatches(rule, transaction.descriptionClean),
    );

    for (const transaction of matchingTransactions) {
      await this.prisma.transactionCategory.upsert({
        where: {
          transactionId: transaction.id,
        },
        create: {
          transactionId: transaction.id,
          vendor: rule.vendor,
          category: rule.category,
          subcategory: rule.subcategory,
          expenseType: rule.expenseType,
          ruleId: rule.id,
          confidence: 100,
          isManual: false,
        },
        update: {
          vendor: rule.vendor,
          category: rule.category,
          subcategory: rule.subcategory,
          expenseType: rule.expenseType,
          ruleId: rule.id,
          confidence: 100,
          isManual: false,
        },
      });
    }

    return {
      ruleId: rule.id,
      matchedRows: matchingTransactions.length,
      updatedRows: matchingTransactions.length,
    };
  }

  private parseMatchType(matchType: string) {
    if (Object.values(MatchType).includes(matchType as MatchType)) {
      return matchType as MatchType;
    }

    throw new BadRequestException(`Unsupported matchType: ${matchType}`);
  }

  private parseExpenseType(expenseType: string) {
    if (Object.values(ExpenseType).includes(expenseType as ExpenseType)) {
      return expenseType as ExpenseType;
    }

    throw new BadRequestException(`Unsupported expenseType: ${expenseType}`);
  }

  private ruleMatches(rule: Rule, description: string) {
    const normalizedDescription = description.toLowerCase();
    const normalizedPattern = rule.pattern.toLowerCase();

    switch (rule.matchType) {
      case MatchType.CONTAINS:
        return normalizedDescription.includes(normalizedPattern);
      case MatchType.EXACT:
        return normalizedDescription === normalizedPattern;
      case MatchType.STARTS_WITH:
        return normalizedDescription.startsWith(normalizedPattern);
      case MatchType.REGEX:
        try {
          return new RegExp(rule.pattern, 'i').test(description);
        } catch {
          return false;
        }
    }
  }
}
