import { HoldingsValuationService } from './holdings-valuation.service';
import type { BulkProviderPrice } from '../market-data/dhan-market-data-provider.service';

type StoredInstrument = {
  id: string;
  symbol: string;
  exchange: string;
  securityId: string | null;
  isin: string | null;
  name: string;
  instrumentType: string;
  source: string;
  isActive: boolean;
  lastVerifiedAt: Date | null;
};

type StoredPriceSnapshot = {
  id: string;
  instrumentId: string;
  ltp: { toNumber(): number };
  previousClose: { toNumber(): number } | null;
  source: string;
  timestamp: Date;
};

class FakePrismaInstrument {
  rows: StoredInstrument[] = [];
  private nextId = 1;

  async findMany(args: { where: { OR: Array<{ symbol: string; exchange: string }> } }) {
    return this.rows.filter((row) =>
      args.where.OR.some(
        (clause) => clause.symbol === row.symbol && clause.exchange === row.exchange,
      ),
    );
  }

  async upsert(args: {
    where: { symbol_exchange: { symbol: string; exchange: string } };
    create: Omit<StoredInstrument, 'id'>;
    update: Partial<StoredInstrument>;
  }) {
    const existing = this.rows.find(
      (row) =>
        row.symbol === args.where.symbol_exchange.symbol &&
        row.exchange === args.where.symbol_exchange.exchange,
    );

    if (existing) {
      Object.assign(existing, args.update);
      return existing;
    }

    const created: StoredInstrument = {
      id: `inst-${this.nextId++}`,
      ...args.create,
      isActive: args.create.isActive ?? true,
    };
    this.rows.push(created);

    return created;
  }
}

class FakePrismaPriceSnapshot {
  rows: StoredPriceSnapshot[] = [];
  createCalls: Array<unknown> = [];
  private nextId = 1;

  async findMany(args: {
    where: { instrumentId: { in: string[] } };
    orderBy: unknown;
  }) {
    const ids = new Set(args.where.instrumentId.in);
    return this.rows
      .filter((row) => ids.has(row.instrumentId))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async create(args: {
    data: {
      instrumentId: string;
      ltp: number;
      previousClose: number | null;
      source: string;
      timestamp: Date;
    };
  }) {
    this.createCalls.push(args.data);
    const created: StoredPriceSnapshot = {
      id: `price-${this.nextId++}`,
      instrumentId: args.data.instrumentId,
      ltp: { toNumber: () => args.data.ltp },
      previousClose:
        args.data.previousClose == null
          ? null
          : { toNumber: () => args.data.previousClose as number },
      source: args.data.source,
      timestamp: args.data.timestamp,
    };
    this.rows.push(created);
    return created;
  }
}

function createService(options: {
  storedInstruments?: StoredInstrument[];
  storedPrices?: StoredPriceSnapshot[];
  bulkPrices?: Map<string, BulkProviderPrice>;
  bulkFailure?: Error;
}) {
  const instrument = new FakePrismaInstrument();
  instrument.rows = options.storedInstruments ?? [];

  const price = new FakePrismaPriceSnapshot();
  price.rows = options.storedPrices ?? [];

  const prisma = { instrument, priceSnapshot: price } as unknown as ConstructorParameters<typeof HoldingsValuationService>[0];

  const provider = {
    bulkKey(exchange: string, securityId: string) {
      const segment = exchange.toUpperCase().includes('BSE')
        ? 'BSE_EQ'
        : 'NSE_EQ';
      return `${segment}:${securityId}`;
    },
    async fetchLatestPricesBulk() {
      if (options.bulkFailure) {
        throw options.bulkFailure;
      }
      return options.bulkPrices ?? new Map<string, BulkProviderPrice>();
    },
  } as unknown as ConstructorParameters<typeof HoldingsValuationService>[1];

  const service = new HoldingsValuationService(prisma, provider);

  return { service, instrument, price };
}

describe('HoldingsValuationService', () => {
  const asOf = new Date('2026-06-03T07:30:00.000Z');

  it('values holdings with live prices from the bulk provider', async () => {
    const bulkPrices = new Map<string, BulkProviderPrice>();
    bulkPrices.set('NSE_EQ:11536', {
      securityId: '11536',
      exchangeSegment: 'NSE_EQ',
      ltp: 2_237.9,
      open: null,
      high: null,
      low: null,
      previousClose: 2_283,
      volume: null,
      source: 'DHAN',
      timestamp: asOf,
      rawPayload: {},
    });

    const { service, price } = createService({ bulkPrices });

    const result = await service.value(
      'user-1',
      [
        {
          tradingSymbol: 'TCS',
          securityId: '11536',
          exchange: 'NSE',
          isin: 'INE467B01029',
          assetClass: 'STOCK',
          totalQty: 18,
          costValue: 42_697,
        },
      ],
      asOf,
    );

    expect(result.holdings).toHaveLength(1);
    const valued = result.holdings[0];
    expect(valued.ltp).toBe(2_237.9);
    expect(valued.investedValue).toBe(42_697);
    expect(valued.currentValue).toBe(40_282.2);
    expect(valued.pnl).toBe(-2_414.8);
    expect(valued.pnlPercent).toBeCloseTo(-5.66, 2);
    expect(valued.dayPnl).toBe(-811.8);
    expect(valued.priceFreshness).toBe('LIVE');
    expect(price.createCalls).toHaveLength(1);
    expect(result.summary.invested).toBe(42_697);
    expect(result.summary.currentValue).toBe(40_282.2);
    expect(result.summary.pnl).toBe(-2_414.8);
    expect(result.summary.pricedCount).toBe(1);
    expect(result.summary.fallbackCount).toBe(0);
  });

  it('reuses stored price snapshots while fresh and skips refetching', async () => {
    const storedInstrument: StoredInstrument = {
      id: 'inst-1',
      symbol: 'AGARWALEYE',
      exchange: 'NSE',
      securityId: '12345',
      isin: null,
      name: 'AGARWALEYE',
      instrumentType: 'EQUITY',
      source: 'DHAN_HOLDINGS',
      isActive: true,
      lastVerifiedAt: asOf,
    };

    const storedPrice: StoredPriceSnapshot = {
      id: 'price-existing',
      instrumentId: 'inst-1',
      ltp: { toNumber: () => 464.55 },
      previousClose: { toNumber: () => 470 },
      source: 'DHAN',
      timestamp: new Date(asOf.getTime() - 60_000),
    };

    const bulkPrices = new Map<string, BulkProviderPrice>();
    const { service, price } = createService({
      storedInstruments: [storedInstrument],
      storedPrices: [storedPrice],
      bulkPrices,
    });

    const result = await service.value(
      'user-1',
      [
        {
          tradingSymbol: 'AGARWALEYE',
          securityId: '12345',
          exchange: 'NSE',
          isin: null,
          assetClass: 'STOCK',
          totalQty: 62,
          costValue: 29_822,
        },
      ],
      asOf,
    );

    expect(price.createCalls).toHaveLength(0);
    expect(result.holdings[0].priceFreshness).toBe('LIVE');
    expect(result.holdings[0].currentValue).toBe(28_802.1);
  });

  it('falls back to cost when bulk fetch fails and emits a warning', async () => {
    const { service } = createService({
      bulkFailure: new Error('Dhan unauthorized'),
    });

    const result = await service.value(
      'user-1',
      [
        {
          tradingSymbol: 'TCS',
          securityId: '11536',
          exchange: 'NSE',
          isin: null,
          assetClass: 'STOCK',
          totalQty: 18,
          costValue: 42_697,
        },
      ],
      asOf,
    );

    expect(result.holdings[0].priceFreshness).toBe('FALLBACK');
    expect(result.holdings[0].currentValue).toBe(42_697);
    expect(result.holdings[0].pnl).toBe(0);
    expect(result.summary.fallbackCount).toBe(1);
    expect(
      result.warnings.some((warning) =>
        warning.startsWith('Live market quotes failed: Dhan unauthorized'),
      ),
    ).toBe(true);
  });

  it('aggregates invested, current, day P&L across stocks and ETFs', async () => {
    const bulkPrices = new Map<string, BulkProviderPrice>();
    bulkPrices.set('NSE_EQ:1', {
      securityId: '1',
      exchangeSegment: 'NSE_EQ',
      ltp: 110,
      open: null,
      high: null,
      low: null,
      previousClose: 100,
      volume: null,
      source: 'DHAN',
      timestamp: asOf,
      rawPayload: {},
    });
    bulkPrices.set('NSE_EQ:2', {
      securityId: '2',
      exchangeSegment: 'NSE_EQ',
      ltp: 90,
      open: null,
      high: null,
      low: null,
      previousClose: 95,
      volume: null,
      source: 'DHAN',
      timestamp: asOf,
      rawPayload: {},
    });

    const { service } = createService({ bulkPrices });

    const result = await service.value(
      'user-1',
      [
        {
          tradingSymbol: 'STK',
          securityId: '1',
          exchange: 'NSE',
          isin: null,
          assetClass: 'STOCK',
          totalQty: 10,
          costValue: 1_000,
        },
        {
          tradingSymbol: 'ETF',
          securityId: '2',
          exchange: 'NSE',
          isin: null,
          assetClass: 'ETF',
          totalQty: 20,
          costValue: 1_900,
        },
      ],
      asOf,
    );

    expect(result.summary.invested).toBe(2_900);
    expect(result.summary.currentValue).toBe(2_900);
    expect(result.summary.pnl).toBe(0);
    expect(result.summary.stockInvested).toBe(1_000);
    expect(result.summary.stockCurrentValue).toBe(1_100);
    expect(result.summary.etfInvested).toBe(1_900);
    expect(result.summary.etfCurrentValue).toBe(1_800);
    expect(result.summary.dayPnl).toBe(0);
  });
});
