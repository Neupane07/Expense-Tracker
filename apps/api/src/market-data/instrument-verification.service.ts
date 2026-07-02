import { Injectable } from '@nestjs/common';
import type {
  MappingStatus,
  QualitySignals,
  ReadinessStatus,
} from '../common/data-quality';
import { InstrumentLifecycleStatus } from '../generated/prisma/client';
import { DHAN_SCRIP_MASTER_SOURCE } from './instrument-master.constants';
import type { InstrumentMappingResolution } from './instrument-master-mapping.service';

export type InstrumentVerificationStatus = {
  symbol: string;
  mappingStatus: MappingStatus;
  verified: boolean;
  securityIdPresent: boolean;
  source: string | null;
  asOf: string | null;
  lifecycleStatus: InstrumentLifecycleStatus | null;
  masterStale: boolean;
  warnings: string[];
  blockers: string[];
  conflicts: InstrumentMappingResolution['conflicts'];
  precedenceRule: string | null;
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
    lifecycleStatus?: InstrumentLifecycleStatus | null;
    masterStale?: boolean;
    mappingStatus?: MappingStatus;
    blockers?: string[];
    warnings?: string[];
    conflicts?: InstrumentMappingResolution['conflicts'];
    precedenceRule?: string | null;
  }): InstrumentVerificationStatus {
    const warnings = [...(input.warnings ?? [])];
    const blockers = [...(input.blockers ?? [])];
    let mappingStatus: MappingStatus = input.mappingStatus ?? 'MISSING';

    if (!input.securityId) {
      mappingStatus = 'MISSING';
      if (!blockers.includes('INSTRUMENT_MAPPING_MISSING')) {
        blockers.push('INSTRUMENT_MAPPING_MISSING');
      }
    } else if (input.mappingStatus) {
      mappingStatus = input.mappingStatus;
    } else if (input.source === DHAN_SCRIP_MASTER_SOURCE) {
      mappingStatus = 'VERIFIED';
    } else if (input.source?.startsWith('DHAN_')) {
      mappingStatus = 'INFERRED';
      warnings.push('INSTRUMENT_MAPPING_INFERRED_FROM_BROKER');
    } else if (input.isActive === false) {
      mappingStatus = 'UNVERIFIED';
      blockers.push('INSTRUMENT_INACTIVE');
    } else {
      mappingStatus = 'VERIFIED';
    }

    if (input.lifecycleStatus === InstrumentLifecycleStatus.INACTIVE) {
      mappingStatus = 'UNVERIFIED';
      if (!blockers.includes('INSTRUMENT_INACTIVE')) {
        blockers.push('INSTRUMENT_INACTIVE');
      }
    }

    if (input.lifecycleStatus === InstrumentLifecycleStatus.DELISTED) {
      mappingStatus = 'UNVERIFIED';
      if (!blockers.includes('INSTRUMENT_DELISTED')) {
        blockers.push('INSTRUMENT_DELISTED');
      }
    }

    if (input.lifecycleStatus === InstrumentLifecycleStatus.RENAMED) {
      mappingStatus = 'UNVERIFIED';
      if (!blockers.includes('INSTRUMENT_SYMBOL_RENAMED')) {
        blockers.push('INSTRUMENT_SYMBOL_RENAMED');
      }
    }

    if (mappingStatus === 'AMBIGUOUS') {
      if (!blockers.includes('INSTRUMENT_MAPPING_AMBIGUOUS')) {
        blockers.push('INSTRUMENT_MAPPING_AMBIGUOUS');
      }
    }

    if (input.masterStale) {
      warnings.push('INSTRUMENT_MASTER_STALE');
    }

    if (!input.lastVerifiedAt) {
      warnings.push('INSTRUMENT_VERIFICATION_TIMESTAMP_MISSING');
    }

    return {
      symbol: input.symbol,
      mappingStatus,
      verified:
        mappingStatus === 'VERIFIED' ||
        (mappingStatus === 'INFERRED' && blockers.length === 0),
      securityIdPresent: Boolean(input.securityId),
      source: input.source,
      asOf: input.lastVerifiedAt
        ? input.lastVerifiedAt instanceof Date
          ? input.lastVerifiedAt.toISOString()
          : new Date(input.lastVerifiedAt).toISOString()
        : null,
      lifecycleStatus: input.lifecycleStatus ?? null,
      masterStale: Boolean(input.masterStale),
      warnings: [...new Set(warnings)],
      blockers: [...new Set(blockers)],
      conflicts: input.conflicts ?? [],
      precedenceRule: input.precedenceRule ?? null,
    };
  }

  evaluateFromResolution(
    resolution: InstrumentMappingResolution,
  ): InstrumentVerificationStatus {
    return this.evaluateInstrumentMapping({
      symbol: resolution.symbol,
      securityId: resolution.securityId,
      source: resolution.source,
      lastVerifiedAt: resolution.masterAsOf,
      isActive:
        resolution.lifecycleStatus === InstrumentLifecycleStatus.ACTIVE ||
        resolution.mappingStatus === 'INFERRED',
      lifecycleStatus: resolution.lifecycleStatus,
      masterStale: resolution.masterStale,
      mappingStatus: resolution.mappingStatus,
      blockers: resolution.blockers,
      warnings: resolution.warnings,
      conflicts: resolution.conflicts,
      precedenceRule: resolution.precedenceRule,
    });
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
