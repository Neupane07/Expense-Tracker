import { ScannerReadinessService } from './scanner-readiness.service';
import { BrokerCredentialsService } from '../broker/broker-credentials.service';
import { MarketDataQualityService } from '../market-data/market-data-quality.service';
import { InstrumentVerificationService } from '../market-data/instrument-verification.service';
import { ResearchSnapshotService } from '../research/research-snapshot.service';
import { ResearchQualityService } from '../research/research-quality.service';

describe('ScannerReadinessService', () => {
  function createService(prisma: Record<string, unknown>) {
    const researchQuality = new ResearchQualityService();
    const researchSnapshots = new ResearchSnapshotService(
      prisma as never,
      researchQuality,
      {
        listItemsForSymbol: jest.fn().mockResolvedValue({ items: [] }),
      } as never,
    );

    return new ScannerReadinessService(
      prisma as never,
      {
        getDhanConnection: jest.fn().mockResolvedValue({
          connected: true,
          status: 'CONFIGURED',
          hasApiKey: true,
          hasApiSecret: true,
          hasAccessToken: true,
          lastValidatedAt: new Date('2026-06-13T08:00:00.000Z'),
        }),
      } as unknown as BrokerCredentialsService,
      new MarketDataQualityService(),
      new InstrumentVerificationService(),
      researchSnapshots,
    );
  }

  it('returns blocked readiness when universe is empty and broker sync is missing', async () => {
    const prisma = {
      brokerConnection: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      brokerHoldingSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { asOf: null } }),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      brokerFundSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      instrument: { findFirst: jest.fn() },
      priceSnapshot: { findFirst: jest.fn() },
      dailyCandle: { findMany: jest.fn() },
      technicalIndicatorSnapshot: { findFirst: jest.fn() },
      researchSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      researchItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma);

    const result = await service.getReadiness('user-1');

    expect(result.status).toBe('BLOCKED');
    expect(result.blockers).toContain('BROKER_SYNC_MISSING');
    expect(result.blockers).toContain('SCAN_UNIVERSE_EMPTY');
    expect(result.researchDisclaimer).toContain('does not run scans');
  });

  it('evaluates explicit symbols without inventing stored market data', async () => {
    const prisma = {
      brokerConnection: {
        findUnique: jest.fn().mockResolvedValue({
          lastSyncAt: new Date('2026-06-13T09:00:00.000Z'),
        }),
      },
      brokerHoldingSnapshot: {
        aggregate: jest.fn().mockResolvedValue({
          _max: { asOf: new Date('2026-06-13T08:00:00.000Z') },
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      brokerFundSnapshot: {
        findFirst: jest.fn().mockResolvedValue({ id: 'fund-1' }),
      },
      instrument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inst-1',
          symbol: 'INFY',
          securityId: '123',
          source: 'DHAN_HOLDINGS',
          lastVerifiedAt: new Date('2026-06-13T08:00:00.000Z'),
          isActive: true,
        }),
      },
      priceSnapshot: {
        findFirst: jest.fn().mockResolvedValue({
          source: 'DHAN',
          timestamp: new Date('2026-06-13T09:30:00.000Z'),
        }),
      },
      dailyCandle: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { isAdjusted: false, date: new Date(), source: 'DHAN' },
          ]),
      },
      technicalIndicatorSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      researchSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      researchItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma);

    const result = await service.getReadiness('user-1', { symbols: ['INFY'] });

    expect(result.universe).toEqual(['INFY']);
    expect(result.universeSource).toBe('symbols');
    expect(result.checks.some((check) => check.id === 'symbol:INFY')).toBe(
      true,
    );
    expect(result.blockers).toContain('CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED');
    expect(result.warnings).toContain('INDICATORS_MISSING');
  });
});
