import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResearchItemsService } from './research-items.service';
import {
  ResearchQualityService,
  type ResearchDataQuality,
} from './research-quality.service';

const itemInclude = {
  evidence: true,
} satisfies Prisma.ResearchItemInclude;

export type ScannerResearchStatus = {
  researchFreshness: 'fresh' | 'stale' | 'missing';
  latestResearchAt: string | null;
  researchWarnings: string[];
  evidenceCount: number;
  riskFlags: string[];
  hasFreshNewsOrFiling: boolean;
  hasStaleResearch: boolean;
};

@Injectable()
export class ResearchSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quality: ResearchQualityService,
    private readonly items: ResearchItemsService,
  ) {}

  async getLatestSnapshot(userId: string, symbol: string) {
    const normalizedSymbol = symbol.trim().toUpperCase();

    const snapshot = await this.prisma.researchSnapshot.findFirst({
      where: { userId, symbol: normalizedSymbol },
      orderBy: { createdAt: 'desc' },
    });

    if (!snapshot) {
      return null;
    }

    return this.serializeSnapshot(snapshot);
  }

  async getSymbolResearch(userId: string, symbol: string) {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const { items } = await this.items.listItemsForSymbol(
      userId,
      normalizedSymbol,
    );
    const researchSnapshot = await this.getLatestSnapshot(
      userId,
      normalizedSymbol,
    );
    const dataQuality = this.buildDataQualityFromItems(
      items.map((item) => ({
        sourceType: item.sourceType,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        evidence: item.evidence.map((row) => ({
          evidenceDate: row.evidenceDate ? new Date(row.evidenceDate) : null,
          sourceUrl: row.sourceUrl,
        })),
      })),
      researchSnapshot,
    );

    const warnings = [
      ...new Set([
        ...(researchSnapshot?.warnings ?? []),
        ...dataQuality.warnings,
        ...items.flatMap((item) => item.warnings),
      ]),
    ];

    return {
      symbol: normalizedSymbol,
      researchSnapshot,
      items,
      warnings,
      dataQuality,
    };
  }

  async regenerateSnapshot(
    userId: string,
    symbol: string,
    instrumentId?: string | null,
  ) {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const rows = await this.prisma.researchItem.findMany({
      where: { userId, symbol: normalizedSymbol },
      include: itemInclude,
      orderBy: [{ publishedAt: 'desc' }, { fetchedAt: 'desc' }],
    });

    const computed = this.computeSnapshotFromRows(rows);
    const snapshot = await this.prisma.researchSnapshot.create({
      data: {
        userId,
        instrumentId: instrumentId ?? rows[0]?.instrumentId ?? null,
        symbol: normalizedSymbol,
        asOf: new Date(),
        latestEvidenceAt: computed.latestEvidenceAt,
        hasFreshEvidence: computed.hasFreshEvidence,
        staleReason: computed.staleReason,
        positiveCount: computed.positiveCount,
        negativeCount: computed.negativeCount,
        neutralCount: computed.neutralCount,
        riskFlags: computed.riskFlags,
        summary: computed.summary,
        warnings: computed.warnings,
      },
    });

    return {
      snapshot: this.serializeSnapshot(snapshot),
      dataQuality: computed.dataQuality,
    };
  }

  async getScannerResearchStatus(
    userId: string,
    symbol: string,
  ): Promise<ScannerResearchStatus> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const rows = await this.prisma.researchItem.findMany({
      where: { userId, symbol: normalizedSymbol },
      include: itemInclude,
    });

    if (rows.length === 0) {
      return {
        researchFreshness: 'missing',
        latestResearchAt: null,
        researchWarnings: ['RESEARCH_EVIDENCE_MISSING'],
        evidenceCount: 0,
        riskFlags: [],
        hasFreshNewsOrFiling: false,
        hasStaleResearch: false,
      };
    }

    const computed = this.computeSnapshotFromRows(rows);

    return {
      researchFreshness: computed.hasFreshEvidence ? 'fresh' : 'stale',
      latestResearchAt: computed.latestEvidenceAt?.toISOString() ?? null,
      researchWarnings: computed.warnings,
      evidenceCount: rows.length,
      riskFlags: computed.riskFlags,
      hasFreshNewsOrFiling: computed.hasFreshEvidence,
      hasStaleResearch: !computed.hasFreshEvidence,
    };
  }

  private computeSnapshotFromRows(
    rows: Prisma.ResearchItemGetPayload<{ include: typeof itemInclude }>[],
  ) {
    const asOf = new Date();
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    const riskFlags: string[] = [];
    let latestEvidenceAt: Date | null = null;
    const itemWarnings: string[] = [];

    for (const row of rows) {
      const counts = this.quality.countImpact(row.impact);
      positiveCount += counts.positive;
      negativeCount += counts.negative;
      neutralCount += counts.neutral;

      if (this.quality.isRiskFlagCategory(row.category)) {
        riskFlags.push(row.title);
      } else if (row.impact === 'NEGATIVE') {
        riskFlags.push(`NEGATIVE:${row.title}`);
      }

      const rowDate = this.resolveItemEvidenceDate(row);
      if (rowDate && (!latestEvidenceAt || rowDate > latestEvidenceAt)) {
        latestEvidenceAt = rowDate;
      }

      itemWarnings.push(
        ...this.quality.assessItemWarnings({
          sourceType: row.sourceType,
          sourceUrl: row.sourceUrl,
          publishedAt: row.publishedAt,
          fetchedAt: row.fetchedAt,
          evidence: row.evidence,
        }),
      );
    }

    const hasFreshEvidence = this.quality.isEvidenceFresh(
      latestEvidenceAt,
      asOf,
    );
    const staleReason =
      rows.length > 0 && !hasFreshEvidence
        ? 'EVIDENCE_OLDER_THAN_THRESHOLD'
        : null;
    const snapshotWarnings = this.quality.buildSnapshotWarnings({
      itemCount: rows.length,
      latestEvidenceAt,
      hasFreshEvidence,
      staleReason,
      items: rows.map((row) => ({ sourceType: row.sourceType })),
    });
    const warnings = [...new Set([...snapshotWarnings, ...itemWarnings])];
    const dataQuality = this.quality.buildDataQuality({
      itemCount: rows.length,
      latestEvidenceAt,
      hasFreshEvidence,
      staleReason,
      items: rows.map((row) => ({ sourceType: row.sourceType })),
    });
    const summary = this.buildDeterministicSummary(rows, {
      positiveCount,
      negativeCount,
      neutralCount,
    });

    return {
      latestEvidenceAt,
      hasFreshEvidence,
      staleReason,
      positiveCount,
      negativeCount,
      neutralCount,
      riskFlags: [...new Set(riskFlags)],
      summary,
      warnings,
      dataQuality,
    };
  }

  private buildDeterministicSummary(
    rows: Prisma.ResearchItemGetPayload<{ include: typeof itemInclude }>[],
    counts: {
      positiveCount: number;
      negativeCount: number;
      neutralCount: number;
    },
  ) {
    if (rows.length === 0) {
      return 'No stored research evidence for this symbol.';
    }

    const latest = rows[0];
    const parts = [
      `${rows.length} stored research item(s).`,
      `Impact counts — positive: ${counts.positiveCount}, negative: ${counts.negativeCount}, neutral: ${counts.neutralCount}.`,
      `Latest item: "${latest.title}" (${latest.category}, ${latest.impact}).`,
    ];

    if (latest.summary) {
      parts.push(`Stored summary: ${latest.summary.slice(0, 280)}`);
    }

    return parts.join(' ');
  }

  private resolveItemEvidenceDate(
    row: Prisma.ResearchItemGetPayload<{ include: typeof itemInclude }>,
  ) {
    const evidenceDates = row.evidence
      .map((item) => item.evidenceDate)
      .filter((value): value is Date => value != null);

    const candidates = [row.publishedAt, ...evidenceDates].filter(
      (value): value is Date => value != null,
    );

    if (candidates.length === 0) {
      return null;
    }

    return candidates.reduce((latest, current) =>
      current > latest ? current : latest,
    );
  }

  private buildDataQualityFromItems(
    items: Array<{
      sourceType: string;
      publishedAt: Date | null;
      evidence: Array<{
        evidenceDate: Date | null;
        sourceUrl: string | null;
      }>;
    }>,
    snapshot: ReturnType<ResearchSnapshotService['serializeSnapshot']> | null,
  ): ResearchDataQuality {
    const latestEvidenceAt = snapshot?.latestEvidenceAt
      ? new Date(snapshot.latestEvidenceAt)
      : this.resolveLatestFromItems(items);

    return this.quality.buildDataQuality({
      itemCount: items.length,
      latestEvidenceAt,
      hasFreshEvidence:
        snapshot?.hasFreshEvidence ??
        this.quality.isEvidenceFresh(latestEvidenceAt),
      staleReason: snapshot?.staleReason ?? null,
      items: items.map((item) => ({ sourceType: item.sourceType })),
    });
  }

  private resolveLatestFromItems(
    items: Array<{
      publishedAt: Date | null;
      evidence: Array<{ evidenceDate: Date | null }>;
    }>,
  ) {
    const dates: Date[] = [];

    for (const item of items) {
      if (item.publishedAt) {
        dates.push(item.publishedAt);
      }

      for (const evidence of item.evidence) {
        if (evidence.evidenceDate) {
          dates.push(evidence.evidenceDate);
        }
      }
    }

    if (dates.length === 0) {
      return null;
    }

    return dates.reduce((latest, current) =>
      current > latest ? current : latest,
    );
  }

  private serializeSnapshot(
    snapshot: Prisma.ResearchSnapshotGetPayload<Record<string, never>>,
  ) {
    return {
      id: snapshot.id,
      userId: snapshot.userId,
      instrumentId: snapshot.instrumentId,
      symbol: snapshot.symbol,
      asOf: snapshot.asOf.toISOString(),
      latestEvidenceAt: snapshot.latestEvidenceAt?.toISOString() ?? null,
      hasFreshEvidence: snapshot.hasFreshEvidence,
      staleReason: snapshot.staleReason,
      positiveCount: snapshot.positiveCount,
      negativeCount: snapshot.negativeCount,
      neutralCount: snapshot.neutralCount,
      riskFlags: Array.isArray(snapshot.riskFlags)
        ? (snapshot.riskFlags as string[])
        : [],
      summary: snapshot.summary,
      warnings: Array.isArray(snapshot.warnings)
        ? (snapshot.warnings as string[])
        : [],
      createdAt: snapshot.createdAt.toISOString(),
    };
  }
}
