import { Injectable } from '@nestjs/common';
import type {
  MappingStatus,
  QualitySignals,
  ReadinessStatus,
} from '../common/data-quality';

export type InstrumentVerificationStatus = {
  symbol: string;
  mappingStatus: MappingStatus;
  verified: boolean;
  securityIdPresent: boolean;
  source: string | null;
  asOf: string | null;
  warnings: string[];
  blockers: string[];
};

export type CorporateActionAdjustmentStatus =
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'NOT_APPLICABLE';

export type CorporateActionPolicyResult = {
  adjustmentStatus: CorporateActionAdjustmentStatus;
  providerAvailable: false;
  blocksHistoricalAnalysis: boolean;
  status: ReadinessStatus;
  warnings: string[];
  blockers: string[];
};

/**
 * Instrument mapping and corporate-action readiness policy.
 *
 * There is no corporate-action ingestion provider in Finance OS today. Candle
 * rows may carry `isAdjusted`, but that flag is not independently verified.
 * Operations that depend on split/bonus-adjusted history must fail closed.
 */
@Injectable()
export class InstrumentVerificationService {
  evaluateInstrumentMapping(input: {
    symbol: string;
    securityId: string | null;
    source: string | null;
    lastVerifiedAt: Date | string | null;
    isActive?: boolean;
  }): InstrumentVerificationStatus {
    const warnings: string[] = [];
    const blockers: string[] = [];
    let mappingStatus: MappingStatus = 'MISSING';

    if (!input.securityId) {
      mappingStatus = 'MISSING';
      blockers.push('INSTRUMENT_MAPPING_MISSING');
    } else if (input.source?.startsWith('DHAN_')) {
      mappingStatus = 'INFERRED';
      warnings.push('INSTRUMENT_MAPPING_INFERRED_FROM_BROKER');
    } else if (input.isActive === false) {
      mappingStatus = 'UNVERIFIED';
      blockers.push('INSTRUMENT_INACTIVE');
    } else {
      mappingStatus = 'VERIFIED';
    }

    if (!input.lastVerifiedAt) {
      warnings.push('INSTRUMENT_VERIFICATION_TIMESTAMP_MISSING');
    }

    return {
      symbol: input.symbol,
      mappingStatus,
      verified: mappingStatus === 'VERIFIED' || mappingStatus === 'INFERRED',
      securityIdPresent: Boolean(input.securityId),
      source: input.source,
      asOf: input.lastVerifiedAt
        ? input.lastVerifiedAt instanceof Date
          ? input.lastVerifiedAt.toISOString()
          : new Date(input.lastVerifiedAt).toISOString()
        : null,
      warnings,
      blockers,
    };
  }

  evaluateCorporateActionPolicy(input: {
    candleCount: number;
    unadjustedCount: number;
    providerClaimsAdjusted?: boolean;
  }): CorporateActionPolicyResult {
    const warnings: string[] = [];
    const blockers: string[] = [];

    if (input.candleCount === 0) {
      return {
        adjustmentStatus: 'NOT_APPLICABLE',
        providerAvailable: false,
        blocksHistoricalAnalysis: true,
        status: 'BLOCKED',
        warnings: ['CANDLES_MISSING'],
        blockers: ['CANDLES_MISSING'],
      };
    }

    if (input.providerClaimsAdjusted) {
      return {
        adjustmentStatus: 'VERIFIED',
        providerAvailable: false,
        blocksHistoricalAnalysis: false,
        status: 'READY',
        warnings,
        blockers,
      };
    }

    warnings.push('CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED');
    blockers.push('CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED');

    return {
      adjustmentStatus: 'UNVERIFIED',
      providerAvailable: false,
      blocksHistoricalAnalysis: true,
      status: 'BLOCKED',
      warnings,
      blockers,
    };
  }

  historicalAnalysisBlockers(
    policy: CorporateActionPolicyResult,
  ): QualitySignals {
    if (!policy.blocksHistoricalAnalysis) {
      return { warnings: [], rejectReasons: [], blockers: [] };
    }

    return {
      warnings: policy.warnings,
      rejectReasons: [],
      blockers: policy.blockers,
    };
  }
}
