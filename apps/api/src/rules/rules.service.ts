import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseType, MatchType, Rule } from '../generated/prisma/client';
import { defaultRules } from '../auth/default-financial-data';
import { getProtectedAutomaticCategory } from '../imports/automatic-category-protection';
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

export type UpdateRuleInput = CreateRuleInput & {
  isActive?: boolean;
};

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.rule.findMany({
      where: { userId },
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

  async findOne(userId: string, id: string) {
    const rule = await this.prisma.rule.findFirst({
      where: { id, userId },
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

  async create(userId: string, input: CreateRuleInput) {
    const data = await this.validateRuleInput(userId, input);

    return this.prisma.rule.create({
      data,
    });
  }

  async update(userId: string, id: string, input: UpdateRuleInput) {
    const existingRule = await this.prisma.rule.findFirst({
      where: { id, userId },
    });

    if (!existingRule) {
      throw new NotFoundException(`Rule ${id} was not found`);
    }

    const data = await this.validateRuleInput(userId, {
      priority: input.priority ?? existingRule.priority,
      matchType: input.matchType ?? existingRule.matchType,
      pattern: input.pattern ?? existingRule.pattern,
      vendor: input.vendor ?? existingRule.vendor,
      category: input.category ?? existingRule.category,
      subcategory: input.subcategory ?? existingRule.subcategory,
      expenseType: input.expenseType ?? existingRule.expenseType,
    });

    return this.prisma.rule.update({
      where: { id },
      data: {
        priority: data.priority,
        matchType: data.matchType,
        pattern: data.pattern,
        vendor: data.vendor,
        category: data.category,
        subcategory: data.subcategory,
        expenseType: data.expenseType,
        isActive: input.isActive ?? existingRule.isActive,
      },
    });
  }

  async createDefaults(userId: string) {
    const existingRules = await this.prisma.rule.findMany({
      where: { userId },
      select: {
        pattern: true,
      },
    });
    const existingPatterns = new Set(
      existingRules.map((rule) => rule.pattern.toLowerCase()),
    );
    const rulesToCreate = defaultRules.filter(
      (rule) => !existingPatterns.has(rule.pattern.toLowerCase()),
    );

    if (rulesToCreate.length > 0) {
      await this.prisma.rule.createMany({
        data: rulesToCreate.map((rule) => ({
          ...rule,
          userId,
        })),
      });
    }

    const rules = await this.prisma.rule.findMany({
      where: { userId, isActive: true },
      orderBy: [
        {
          priority: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
    const updatedRows = await this.applyBestMatchingRules(userId, rules);

    return {
      createdRules: rulesToCreate.length,
      updatedRows,
    };
  }

  async apply(userId: string, id: string) {
    const rule = await this.prisma.rule.findFirst({
      where: { id, userId },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${id} was not found`);
    }

    if (!rule.isActive) {
      throw new BadRequestException(
        'Inactive rules cannot be applied to existing transactions. Activate the rule first.',
      );
    }

    const candidates = await this.prisma.transaction.findMany({
      where: { userId },
      include: {
        category: true,
      },
    });
    const matchingTransactions = candidates.filter((transaction) =>
      this.ruleMatches(rule, transaction.descriptionClean),
    );
    let updatedRows = 0;

    for (const transaction of matchingTransactions) {
      if (transaction.category?.isManual) {
        continue;
      }

      const protectedCategory = getProtectedAutomaticCategory(
        transaction,
        rule.expenseType,
      );
      await this.prisma.transactionCategory.upsert({
        where: {
          transactionId: transaction.id,
        },
        create: protectedCategory
          ? {
              transactionId: transaction.id,
              ...protectedCategory,
              ruleId: null,
              isManual: false,
            }
          : {
              transactionId: transaction.id,
              vendor: rule.vendor,
              category: rule.category,
              subcategory: rule.subcategory,
              expenseType: rule.expenseType,
              ruleId: rule.id,
              confidence: 100,
              isManual: false,
            },
        update: protectedCategory
          ? {
              ...protectedCategory,
              ruleId: null,
              isManual: false,
            }
          : {
              vendor: rule.vendor,
              category: rule.category,
              subcategory: rule.subcategory,
              expenseType: rule.expenseType,
              ruleId: rule.id,
              confidence: 100,
              isManual: false,
            },
      });
      updatedRows += 1;
    }

    return {
      ruleId: rule.id,
      matchedRows: matchingTransactions.length,
      updatedRows,
    };
  }

  private async validateRuleInput(userId: string, input: CreateRuleInput) {
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
        where: { userId },
        _max: {
          priority: true,
        },
      }),
    ]);

    return {
      userId,
      priority: input.priority ?? (maxPriority._max.priority ?? 0) + 10,
      matchType,
      pattern,
      vendor,
      category,
      subcategory: input.subcategory?.trim() || null,
      expenseType,
      isActive: true,
    };
  }

  private async applyBestMatchingRules(userId: string, rules: Rule[]) {
    const candidates = await this.prisma.transaction.findMany({
      where: { userId },
      include: {
        category: true,
      },
    });
    let updatedRows = 0;

    for (const transaction of candidates) {
      if (
        transaction.category?.isManual ||
        (transaction.category &&
          transaction.category.expenseType !== ExpenseType.REVIEW)
      ) {
        continue;
      }

      const matchedRule = rules.find((rule) =>
        this.ruleMatches(rule, transaction.descriptionClean),
      );

      if (!matchedRule) {
        continue;
      }

      const protectedCategory = getProtectedAutomaticCategory(
        transaction,
        matchedRule.expenseType,
      );

      await this.prisma.transactionCategory.upsert({
        where: {
          transactionId: transaction.id,
        },
        create: protectedCategory
          ? {
              transactionId: transaction.id,
              ...protectedCategory,
              ruleId: null,
              isManual: false,
            }
          : {
              transactionId: transaction.id,
              vendor: matchedRule.vendor,
              category: matchedRule.category,
              subcategory: matchedRule.subcategory,
              expenseType: matchedRule.expenseType,
              ruleId: matchedRule.id,
              confidence: 100,
              isManual: false,
            },
        update: protectedCategory
          ? {
              ...protectedCategory,
              ruleId: null,
              isManual: false,
            }
          : {
              vendor: matchedRule.vendor,
              category: matchedRule.category,
              subcategory: matchedRule.subcategory,
              expenseType: matchedRule.expenseType,
              ruleId: matchedRule.id,
              confidence: 100,
              isManual: false,
            },
      });
      updatedRows += 1;
    }

    return updatedRows;
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
