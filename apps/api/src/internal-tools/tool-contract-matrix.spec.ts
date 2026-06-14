import { NotFoundException } from '@nestjs/common';
import { InstrumentVerificationService } from '../market-data/instrument-verification.service';
import { CandlesService } from '../market-data/candles.service';
import { IndicatorsService } from '../market-data/indicators.service';
import { InstrumentsService } from '../market-data/instruments.service';
import { MarketDataQualityService } from '../market-data/market-data-quality.service';
import { PricesService } from '../market-data/prices.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import { ResearchSnapshotService } from '../research/research-snapshot.service';
import { GetMarketDataStatusTool } from './tools/get-market-data-status.tool';
import { GetStockDeepDiveTool } from './tools/get-stock-deep-dive.tool';
import { GetPortfolioSnapshotTool } from './tools/get-portfolio-snapshot.tool';

const context = {
  userId: 'user-a',
  userEmail: 'user-a@example.com',
  userRole: 'MEMBER',
};

describe('Market data and deep-dive tool contracts', () => {
  const instrumentVerification = new InstrumentVerificationService();

  it('get_market_data_status blocks unverified corporate-action history', async () => {
    const tool = new GetMarketDataStatusTool(
      {
        brokerHoldingSnapshot: {
          aggregate: jest.fn().mockResolvedValue({ _max: { asOf: null } }),
        },
      } as unknown as PrismaService,
      {
        findBySymbol: jest.fn().mockResolvedValue({
          securityId: 'sec-1',
          source: 'DHAN_HOLDING',
          lastVerifiedAt: new Date(),
          isActive: true,
        }),
      } as unknown as InstrumentsService,
      {
        getLatest: jest.fn().mockResolvedValue({
          price: { timestamp: new Date(), source: 'DHAN' },
        }),
      } as unknown as PricesService,
      {
        getDailyCandles: jest.fn().mockResolvedValue({
          candles: [{ isAdjusted: false }, { isAdjusted: false }],
        }),
      } as unknown as CandlesService,
      {
        getLatest: jest.fn().mockResolvedValue({
          indicators: { asOfDate: new Date() },
        }),
      } as unknown as IndicatorsService,
      new MarketDataQualityService(),
      instrumentVerification,
    );

    const result = await tool.handle(context, { symbols: ['INFY'] });

    expect(result.status).toBe('unavailable');
    expect(result.rejectReasons).toContain(
      'HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT',
    );
    expect(
      (result.data as { symbols: Array<{ corporateAction: unknown }> })
        .symbols[0]?.corporateAction,
    ).toBeTruthy();
  });

  it('get_market_data_status returns unavailable for empty universe', async () => {
    const tool = new GetMarketDataStatusTool(
      {
        brokerHoldingSnapshot: {
          aggregate: jest.fn().mockResolvedValue({ _max: { asOf: null } }),
        },
      } as unknown as PrismaService,
      {} as InstrumentsService,
      {} as PricesService,
      {} as CandlesService,
      {} as IndicatorsService,
      new MarketDataQualityService(),
      instrumentVerification,
    );

    const result = await tool.handle(context, {});

    expect(result.status).toBe('unavailable');
    expect(result.rejectReasons).toContain('MARKET_DATA_UNIVERSE_EMPTY');
  });

  it('get_stock_deep_dive rejects when corporate-action policy blocks history', async () => {
    const tool = new GetStockDeepDiveTool(
      {
        getInstrument: jest.fn().mockResolvedValue({ symbol: 'INFY' }),
        getLatestPrice: jest.fn().mockResolvedValue({ warnings: [] }),
        getCandles: jest.fn().mockResolvedValue({
          candles: [{ isAdjusted: false }, { isAdjusted: false }],
        }),
        getLatestIndicators: jest.fn().mockResolvedValue({ indicators: {} }),
      } as unknown as MarketDataService,
      {
        getSymbolResearch: jest.fn().mockResolvedValue({
          symbol: 'INFY',
          items: [],
          warnings: [],
          dataQuality: {},
        }),
      } as unknown as ResearchSnapshotService,
      instrumentVerification,
    );

    const result = await tool.handle(context, { symbol: 'INFY' });

    expect(result.status).toBe('rejected');
    expect(result.rejectReasons).toContain(
      'HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT',
    );
    expect(
      (result.data as { sections: { corporateAction: unknown } }).sections
        .corporateAction,
    ).toBeTruthy();
  });

  it('get_stock_deep_dive returns unavailable when instrument mapping is missing', async () => {
    const tool = new GetStockDeepDiveTool(
      {
        getInstrument: jest
          .fn()
          .mockRejectedValue(new NotFoundException('missing')),
        getLatestPrice: jest
          .fn()
          .mockRejectedValue(new NotFoundException('missing')),
        getCandles: jest
          .fn()
          .mockRejectedValue(new NotFoundException('missing')),
        getLatestIndicators: jest
          .fn()
          .mockRejectedValue(new NotFoundException('missing')),
      } as unknown as MarketDataService,
      {
        getSymbolResearch: jest.fn().mockResolvedValue({
          symbol: 'INFY',
          items: [],
          warnings: [],
          dataQuality: {},
        }),
      } as unknown as ResearchSnapshotService,
      instrumentVerification,
    );

    const result = await tool.handle(context, { symbol: 'INFY' });

    expect(result.status).toBe('unavailable');
    expect(result.rejectReasons).toContain('INSTRUMENT_MAPPING_MISSING');
  });
});

describe('Portfolio snapshot stale pricing', () => {
  it('returns rejected when PRICE_STALE is present', async () => {
    const tool = new GetPortfolioSnapshotTool({
      getSnapshot: jest.fn().mockResolvedValue({
        id: 'snap-1',
        snapshotTime: new Date('2026-06-14T00:00:00.000Z'),
        warnings: ['PRICE_STALE'],
        listedSummary: { fallbackCount: 0, holdingCount: 2 },
        priceAsOf: new Date('2026-06-14T00:00:00.000Z'),
        source: {},
      }),
    } as unknown as import('../portfolio/portfolio.service').PortfolioService);

    const result = await tool.handle(context);

    expect(result.status).toBe('rejected');
    expect(result.rejectReasons).toContain('PRICE_STALE');
    expect(result.dataQuality?.freshness).not.toBe('RECENT');
  });
});
