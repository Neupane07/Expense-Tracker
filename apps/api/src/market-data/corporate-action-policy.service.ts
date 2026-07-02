import { Injectable } from '@nestjs/common';
import type { ReadinessStatus } from '../common/data-quality';
import { CorporateActionEventType } from '../generated/prisma/client';
import {
  CORPORATE_ACTION_EVENT_SYNC_STALE_DAYS,
  DHAN_CANDLE_ADJUSTMENT_POLICY,
  DHAN_MARKET_DATA_SOURCE,
  PRICE_AFFECTING_EVENT_TYPES,
} from './corporate-action.constants';

export type CorporateActionAdjustmentStatus =
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'STALE'
  | 'NOT_APPLICABLE';

export type CorporateActionEventCatalogStatus =
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'SYNCED'
  | 'STALE'
  | 'PENDING_PROCESSING';

export type CorporateActionPolicyResult = {
  adjustmentStatus: CorporateActionAdjustmentStatus;
  candleAdjustmentSource: string | null;
  candleAdjustmentPolicy: string | null;
  eventCatalogStatus: CorporateActionEventCatalogStatus;
  providerAvailable: boolean;
  eventProviderAvailable: boolean;
  blocksHistoricalAnalysis: boolean;
  status: ReadinessStatus;
  warnings: string[];
  blockers: string[];
  lastEventSyncAt: string | null;
  unprocessedEventCount: number;
};

export type CandleAdjustmentInput = {
  source?: string | null;
  isAdjusted?: boolean;
  dataQuality?: Record<string, unknown> | null;
};

export type CorporateActionEventSummary = {
  eventType: CorporateActionEventType;
  exDate: Date | null;
  effectiveDate: Date;
  processedAt: Date | null;
  supersededAt: Date | null;
};

@Injectable()
export class CorporateActionPolicyService {
  evaluatePolicy(input: {
    candles: CandleAdjustmentInput[];
    events?: CorporateActionEventSummary[];
    lastSuccessfulEventSyncAt?: Date | null;
    asOf?: Date;
  }): CorporateActionPolicyResult {
    const warnings: string[] = [];
    const blockers: string[] = [];
    const asOf = input.asOf ?? new Date();
    const activeEvents = (input.events ?? []).filter(
      (event) => event.supersededAt == null,
    );
    const unprocessedPriceAffecting = activeEvents.filter(
      (event) =>
        PRICE_AFFECTING_EVENT_TYPES.has(event.eventType) &&
        event.processedAt == null,
    );

    if (input.candles.length === 0) {
      return {
        adjustmentStatus: 'NOT_APPLICABLE',
        candleAdjustmentSource: null,
        candleAdjustmentPolicy: null,
        eventCatalogStatus: this.resolveEventCatalogStatus(
          input.lastSuccessfulEventSyncAt,
          activeEvents.length,
          unprocessedPriceAffecting.length,
          asOf,
        ),
        providerAvailable: true,
        eventProviderAvailable: false,
        blocksHistoricalAnalysis: true,
        status: 'BLOCKED',
        warnings: ['CANDLES_MISSING'],
        blockers: ['CANDLES_MISSING'],
        lastEventSyncAt: input.lastSuccessfulEventSyncAt?.toISOString() ?? null,
        unprocessedEventCount: unprocessedPriceAffecting.length,
      };
    }

    const verifiedCandles = input.candles.filter((candle) =>
      this.isProviderVerifiedAdjustedCandle(candle),
    );
    const candleAdjustmentVerified =
      verifiedCandles.length === input.candles.length &&
      verifiedCandles.length > 0;

    const eventCatalogStatus = this.resolveEventCatalogStatus(
      input.lastSuccessfulEventSyncAt,
      activeEvents.length,
      unprocessedPriceAffecting.length,
      asOf,
    );

    if (unprocessedPriceAffecting.length > 0) {
      blockers.push('CORPORATE_ACTION_PENDING_INVALIDATION');
      warnings.push('CORPORATE_ACTION_PENDING_INVALIDATION');
    }

    if (eventCatalogStatus === 'STALE' && activeEvents.length > 0) {
      blockers.push('CORPORATE_ACTION_SYNC_STALE');
      warnings.push('CORPORATE_ACTION_SYNC_STALE');
    }

    if (!candleAdjustmentVerified) {
      blockers.push('CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED');
      warnings.push('CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED');

      return {
        adjustmentStatus: 'UNVERIFIED',
        candleAdjustmentSource: input.candles[0]?.source ?? null,
        candleAdjustmentPolicy: null,
        eventCatalogStatus,
        providerAvailable: true,
        eventProviderAvailable: false,
        blocksHistoricalAnalysis: true,
        status: 'BLOCKED',
        warnings: [...new Set(warnings)],
        blockers: [...new Set(blockers)],
        lastEventSyncAt: input.lastSuccessfulEventSyncAt?.toISOString() ?? null,
        unprocessedEventCount: unprocessedPriceAffecting.length,
      };
    }

    const blocksHistoricalAnalysis =
      blockers.includes('CORPORATE_ACTION_PENDING_INVALIDATION') ||
      blockers.includes('CORPORATE_ACTION_SYNC_STALE');

    return {
      adjustmentStatus: blocksHistoricalAnalysis ? 'STALE' : 'VERIFIED',
      candleAdjustmentSource: DHAN_MARKET_DATA_SOURCE,
      candleAdjustmentPolicy: DHAN_CANDLE_ADJUSTMENT_POLICY,
      eventCatalogStatus,
      providerAvailable: true,
      eventProviderAvailable: false,
      blocksHistoricalAnalysis,
      status: blocksHistoricalAnalysis ? 'BLOCKED' : 'READY',
      warnings: [...new Set(warnings)],
      blockers: [...new Set(blockers)],
      lastEventSyncAt: input.lastSuccessfulEventSyncAt?.toISOString() ?? null,
      unprocessedEventCount: unprocessedPriceAffecting.length,
    };
  }

  isProviderVerifiedAdjustedCandle(candle: CandleAdjustmentInput) {
    if (candle.source !== DHAN_MARKET_DATA_SOURCE || !candle.isAdjusted) {
      return false;
    }

    const policy = candle.dataQuality?.adjustmentPolicy;

    return policy === DHAN_CANDLE_ADJUSTMENT_POLICY;
  }

  buildCandleAdjustmentDataQuality(verifiedAt: Date) {
    return {
      adjustmentPolicy: DHAN_CANDLE_ADJUSTMENT_POLICY,
      adjustmentVerifiedAt: verifiedAt.toISOString(),
      providerSource: DHAN_MARKET_DATA_SOURCE,
    };
  }

  resolveInvalidationFromDate(event: {
    eventType: CorporateActionEventType;
    exDate: Date | null;
    effectiveDate: Date;
  }) {
    if (!PRICE_AFFECTING_EVENT_TYPES.has(event.eventType)) {
      return null;
    }

    return event.exDate ?? event.effectiveDate;
  }

  private resolveEventCatalogStatus(
    lastSuccessfulEventSyncAt: Date | null | undefined,
    activeEventCount: number,
    unprocessedCount: number,
    asOf: Date,
  ): CorporateActionEventCatalogStatus {
    if (activeEventCount === 0) {
      return 'NOT_CONFIGURED';
    }

    if (unprocessedCount > 0) {
      return 'PENDING_PROCESSING';
    }

    if (!lastSuccessfulEventSyncAt) {
      return 'UNAVAILABLE';
    }

    const staleMs =
      CORPORATE_ACTION_EVENT_SYNC_STALE_DAYS * 24 * 60 * 60 * 1000;

    if (asOf.getTime() - lastSuccessfulEventSyncAt.getTime() > staleMs) {
      return 'STALE';
    }

    return 'SYNCED';
  }
}
