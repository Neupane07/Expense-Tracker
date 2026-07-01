import { Injectable } from '@nestjs/common';
import type {
  ResearchCategory,
  ResearchImpact,
} from '../generated/prisma/client';

export const DEFAULT_RESEARCH_STALE_DAYS = 30;

export type ResearchDataQualityStatus =
  | 'fresh'
  | 'stale'
  | 'missing'
  | 'user-provided'
  | 'official';

export type ResearchDataQuality = {
  status: ResearchDataQualityStatus;
  latestEvidenceAt: string | null;
  staleReason: string | null;
  hasUserProvidedEvidence: boolean;
  hasOfficialSource: boolean;
  warnings: string[];
};

type ItemQualityInput = {
  sourceType: string;
  sourceUrl: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  evidence: Array<{
    evidenceDate: Date | null;
    sourceUrl: string | null;
  }>;
};

type SnapshotQualityInput = {
  itemCount: number;
  latestEvidenceAt: Date | null;
  hasFreshEvidence: boolean;
  staleReason: string | null;
  items: Array<{ sourceType: string }>;
};

@Injectable()
export class ResearchQualityService {
  getStaleThresholdMs() {
    const configured = Number(process.env.RESEARCH_STALE_DAYS);
    const days =
      Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_RESEARCH_STALE_DAYS;

    return days * 24 * 60 * 60 * 1000;
  }

  isEvidenceFresh(latestEvidenceAt: Date | null, asOf = new Date()) {
    if (!latestEvidenceAt) {
      return false;
    }

    return (
      asOf.getTime() - latestEvidenceAt.getTime() <= this.getStaleThresholdMs()
    );
  }

  assessItemWarnings(item: ItemQualityInput) {
    const warnings: string[] = [];

    if (!item.sourceUrl) {
      warnings.push('RESEARCH_ITEM_MISSING_SOURCE_URL');
    }

    if (!item.publishedAt) {
      warnings.push('RESEARCH_ITEM_MISSING_PUBLISHED_DATE');
    }

    for (const evidence of item.evidence) {
      if (!evidence.sourceUrl) {
        warnings.push('RESEARCH_EVIDENCE_MISSING_SOURCE_URL');
      }

      if (!evidence.evidenceDate) {
        warnings.push('RESEARCH_EVIDENCE_MISSING_DATE');
      }
    }

    return [...new Set(warnings)];
  }

  buildSnapshotWarnings(input: SnapshotQualityInput) {
    const warnings: string[] = [];

    if (input.itemCount === 0) {
      warnings.push('RESEARCH_EVIDENCE_MISSING');
      return warnings;
    }

    if (!input.latestEvidenceAt) {
      warnings.push('RESEARCH_EVIDENCE_MISSING_DATE');
    }

    if (!input.hasFreshEvidence) {
      warnings.push('STALE_RESEARCH_EVIDENCE');
      if (input.staleReason) {
        warnings.push(input.staleReason);
      }
    }

    const hasOfficial = input.items.some((item) =>
      this.isOfficialSourceType(item.sourceType),
    );

    if (!hasOfficial) {
      warnings.push('NO_OFFICIAL_FILING_SOURCE');
    }

    return [...new Set(warnings)];
  }

  buildDataQuality(input: SnapshotQualityInput): ResearchDataQuality {
    const warnings = this.buildSnapshotWarnings(input);
    const hasUserProvidedEvidence = input.items.some((item) =>
      this.isUserProvidedSourceType(item.sourceType),
    );
    const hasOfficialSource = input.items.some((item) =>
      this.isOfficialSourceType(item.sourceType),
    );

    let status: ResearchDataQualityStatus = 'missing';

    if (input.itemCount === 0) {
      status = 'missing';
    } else if (input.hasFreshEvidence && hasOfficialSource) {
      status = 'official';
    } else if (input.hasFreshEvidence) {
      status = hasUserProvidedEvidence ? 'user-provided' : 'fresh';
    } else {
      // Manual/user evidence beyond the freshness threshold is stale, not user-provided.
      status = 'stale';
    }

    return {
      status,
      latestEvidenceAt: input.latestEvidenceAt?.toISOString() ?? null,
      staleReason: input.staleReason,
      hasUserProvidedEvidence,
      hasOfficialSource,
      warnings,
    };
  }

  countImpact(impact: ResearchImpact) {
    if (impact === 'POSITIVE') {
      return { positive: 1, negative: 0, neutral: 0 };
    }

    if (impact === 'NEGATIVE') {
      return { positive: 0, negative: 1, neutral: 0 };
    }

    if (impact === 'NEUTRAL') {
      return { positive: 0, negative: 0, neutral: 1 };
    }

    return { positive: 0, negative: 0, neutral: 0 };
  }

  isRiskFlagCategory(category: ResearchCategory) {
    return category === 'RISK_FLAG';
  }

  private isUserProvidedSourceType(sourceType: string) {
    const normalized = sourceType.trim().toUpperCase();

    return (
      normalized === 'MANUAL' ||
      normalized === 'USER_NOTE' ||
      normalized === 'USER_URL'
    );
  }

  private isOfficialSourceType(sourceType: string) {
    const normalized = sourceType.trim().toUpperCase();

    return (
      normalized === 'OFFICIAL_FILING' ||
      normalized === 'NSE' ||
      normalized === 'BSE'
    );
  }
}
