import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateResearchItemInput,
  ListResearchItemsQuery,
} from './research.dto';
import { ResearchQualityService } from './research-quality.service';

const itemInclude = {
  evidence: {
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ResearchItemInclude;

@Injectable()
export class ResearchItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quality: ResearchQualityService,
  ) {}

  async listItems(userId: string, query: ListResearchItemsQuery) {
    const where: Prisma.ResearchItemWhereInput = { userId };

    if (query.symbol) {
      where.symbol = query.symbol.trim().toUpperCase();
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.impact) {
      where.impact = query.impact;
    }

    const items = await this.prisma.researchItem.findMany({
      where,
      include: itemInclude,
      orderBy: [{ publishedAt: 'desc' }, { fetchedAt: 'desc' }],
    });

    return {
      items: items.map((item) => this.serializeItem(item)),
    };
  }

  async listItemsForSymbol(userId: string, symbol: string) {
    return this.listItems(userId, { symbol });
  }

  async createItem(
    userId: string,
    input: CreateResearchItemInput,
    options?: {
      instrumentId?: string | null;
      prepared?: {
        title: string;
        summary: string;
        sourceType: string;
        sourceName: string;
        sourceUrl?: string | null;
        publishedAt?: Date | null;
        fetchedAt: Date;
        confidence: number;
        rawPayload?: Record<string, unknown> | null;
      };
    },
  ) {
    const symbol = input.symbol.trim().toUpperCase();
    const prepared = options?.prepared;
    const now = new Date();

    const item = await this.prisma.researchItem.create({
      data: {
        userId,
        instrumentId: options?.instrumentId ?? null,
        symbol,
        title: prepared?.title ?? input.title.trim(),
        summary: prepared?.summary ?? input.summary.trim(),
        category: input.category,
        impact: input.impact,
        sourceType:
          prepared?.sourceType ?? input.sourceType.trim().toUpperCase(),
        sourceName: prepared?.sourceName ?? input.sourceName.trim(),
        sourceUrl: prepared?.sourceUrl ?? input.sourceUrl ?? null,
        publishedAt:
          prepared?.publishedAt ??
          (input.publishedAt ? new Date(input.publishedAt) : null),
        fetchedAt: prepared?.fetchedAt ?? now,
        asOf: now,
        confidence: prepared?.confidence ?? 0.85,
        rawPayload: (prepared?.rawPayload ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        evidence: {
          create:
            input.evidence?.map((row) => ({
              label: row.label.trim(),
              value: row.value.trim(),
              unit: row.unit ?? null,
              evidenceDate: row.evidenceDate
                ? new Date(row.evidenceDate)
                : null,
              sourceUrl: row.sourceUrl ?? null,
            })) ?? [],
        },
      },
      include: itemInclude,
    });

    return this.serializeItem(item);
  }

  async deleteItem(userId: string, itemId: string) {
    const existing = await this.prisma.researchItem.findFirst({
      where: { id: itemId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Research item not found');
    }

    await this.prisma.researchItem.delete({
      where: { id: itemId },
    });

    return { deleted: true, id: itemId, symbol: existing.symbol };
  }

  async findOwnedItem(userId: string, itemId: string) {
    const item = await this.prisma.researchItem.findFirst({
      where: { id: itemId, userId },
      include: itemInclude,
    });

    if (!item) {
      throw new NotFoundException('Research item not found');
    }

    return item;
  }

  serializeItem(
    item: Prisma.ResearchItemGetPayload<{ include: typeof itemInclude }>,
  ) {
    const itemWarnings = this.quality.assessItemWarnings({
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt,
      fetchedAt: item.fetchedAt,
      evidence: item.evidence,
    });

    return {
      id: item.id,
      userId: item.userId,
      instrumentId: item.instrumentId,
      symbol: item.symbol,
      title: item.title,
      summary: item.summary,
      category: item.category,
      impact: item.impact,
      sourceType: item.sourceType,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      fetchedAt: item.fetchedAt.toISOString(),
      asOf: item.asOf.toISOString(),
      confidence: Number(item.confidence),
      evidence: item.evidence.map((row) => ({
        id: row.id,
        label: row.label,
        value: row.value,
        unit: row.unit,
        evidenceDate: row.evidenceDate?.toISOString() ?? null,
        sourceUrl: row.sourceUrl,
        createdAt: row.createdAt.toISOString(),
      })),
      warnings: itemWarnings,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
