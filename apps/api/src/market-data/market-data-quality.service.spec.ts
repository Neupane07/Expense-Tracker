import { CandlesService } from './candles.service';
import { MarketDataQualityService } from './market-data-quality.service';

describe('MarketDataQualityService', () => {
  it('emits a stale price warning for old snapshots', () => {
    const service = new MarketDataQualityService();
    const result = service.priceQuality(
      new Date('2026-05-28T09:15:00.000Z'),
      new Date('2026-05-30T09:15:00.000Z'),
    );

    expect(result.dataQuality).toEqual({
      freshness: 'STALE',
      confidence: 'LOW',
    });
    expect(result.warnings).toContain('PRICE_STALE');
  });

  it('warns when candles are missing', () => {
    const service = new MarketDataQualityService();

    expect(service.candleWarnings(0)).toContain('CANDLES_MISSING');
  });
});

describe('CandlesService missing candle handling', () => {
  it('returns a warning and rejects indicator inputs when no candles exist', async () => {
    const prisma = {
      dailyCandle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const instruments = {
      findBySymbol: jest.fn().mockResolvedValue({
        id: 'instrument-1',
        symbol: 'INFY',
        exchange: 'NSE',
        securityId: null,
        isin: null,
        name: 'INFY',
        instrumentType: 'EQUITY',
        sector: null,
        industry: null,
        isActive: true,
        source: 'TEST',
        lastVerifiedAt: null,
      }),
      serialize: jest.fn().mockReturnValue({ symbol: 'INFY' }),
    };
    const service = new CandlesService(
      prisma as never,
      instruments as never,
      { source: 'DHAN' } as never,
      new MarketDataQualityService(),
    );

    const response = await service.getDailyCandles('user-1', 'INFY');

    expect(response.warnings).toContain('CANDLES_MISSING');
    await expect(
      service.getCandlesForIndicators('user-1', 'INFY'),
    ).rejects.toThrow('Daily candles are missing');
  });
});
