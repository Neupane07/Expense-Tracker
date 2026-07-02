import { Test, TestingModule } from '@nestjs/testing';
import { CorporateActionPolicyService } from './corporate-action-policy.service';
import {
  DHAN_CANDLE_ADJUSTMENT_POLICY,
  DHAN_MARKET_DATA_SOURCE,
} from './corporate-action.constants';

describe('CorporateActionPolicyService', () => {
  let service: CorporateActionPolicyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CorporateActionPolicyService],
    }).compile();

    service = module.get(CorporateActionPolicyService);
  });

  it('verifies Dhan provider-adjusted daily candles', () => {
    const result = service.evaluatePolicy({
      candles: [
        {
          source: DHAN_MARKET_DATA_SOURCE,
          isAdjusted: true,
          dataQuality: { adjustmentPolicy: DHAN_CANDLE_ADJUSTMENT_POLICY },
        },
      ],
    });

    expect(result.adjustmentStatus).toBe('VERIFIED');
    expect(result.providerAvailable).toBe(true);
    expect(result.blocksHistoricalAnalysis).toBe(false);
    expect(result.candleAdjustmentPolicy).toBe(DHAN_CANDLE_ADJUSTMENT_POLICY);
  });

  it('rejects unverified or legacy unadjusted candles', () => {
    const result = service.evaluatePolicy({
      candles: [
        {
          source: DHAN_MARKET_DATA_SOURCE,
          isAdjusted: false,
          dataQuality: null,
        },
      ],
    });

    expect(result.adjustmentStatus).toBe('UNVERIFIED');
    expect(result.blocksHistoricalAnalysis).toBe(true);
    expect(result.blockers).toContain('CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED');
  });

  it('blocks when price-affecting events are pending invalidation', () => {
    const result = service.evaluatePolicy({
      candles: [
        {
          source: DHAN_MARKET_DATA_SOURCE,
          isAdjusted: true,
          dataQuality: { adjustmentPolicy: DHAN_CANDLE_ADJUSTMENT_POLICY },
        },
      ],
      events: [
        {
          eventType: 'SPLIT',
          exDate: new Date('2026-05-01'),
          effectiveDate: new Date('2026-05-01'),
          processedAt: null,
          supersededAt: null,
        },
      ],
      lastSuccessfulEventSyncAt: new Date('2026-06-01'),
    });

    expect(result.blocksHistoricalAnalysis).toBe(true);
    expect(result.blockers).toContain('CORPORATE_ACTION_PENDING_INVALIDATION');
  });

  it('marks event catalog stale after threshold', () => {
    const result = service.evaluatePolicy({
      candles: [
        {
          source: DHAN_MARKET_DATA_SOURCE,
          isAdjusted: true,
          dataQuality: { adjustmentPolicy: DHAN_CANDLE_ADJUSTMENT_POLICY },
        },
      ],
      events: [
        {
          eventType: 'DIVIDEND',
          exDate: new Date('2026-01-01'),
          effectiveDate: new Date('2026-01-01'),
          processedAt: new Date('2026-01-02'),
          supersededAt: null,
        },
      ],
      lastSuccessfulEventSyncAt: new Date('2026-01-01'),
      asOf: new Date('2026-06-01'),
    });

    expect(result.eventCatalogStatus).toBe('STALE');
    expect(result.blockers).toContain('CORPORATE_ACTION_SYNC_STALE');
  });
});
