import { Injectable, Logger } from '@nestjs/common';
import {
  type BulkProviderPrice,
  DhanMarketDataProviderService,
} from '../market-data/dhan-market-data-provider.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;
const STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ValuationInputHolding = {
  tradingSymbol: string;
  securityId: string | null;
  exchange: string | null;
  isin: string | null;
  assetClass: string;
  totalQty: number;
  costValue: number;
};

export type PriceFreshness =
  | 'LIVE'
  | 'RECENT'
  | 'STALE'
  | 'MISSING'
  | 'FALLBACK';

export type ValuedHolding<T extends ValuationInputHolding> = T & {
  ltp: number | null;
  previousClose: number | null;
  investedValue: number;
  currentValue: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number | null;
  dayPnl: number | null;
  dayPnlPercent: number | null;
  priceSource: string | null;
  priceTimestamp: Date | null;
  priceFreshness: PriceFreshness;
  warnings: string[];
};

export type HoldingsValuationSummary = {
  holdingCount: number;
  pricedCount: number;
  fallbackCount: number;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number | null;
  dayPnl: number | null;
  dayPnlPercent: number | null;
  stockInvested: number;
  stockCurrentValue: number;
  etfInvested: number;
  etfCurrentValue: number;
};

export type HoldingsValuationResult<T extends ValuationInputHolding> = {
  holdings: ValuedHolding<T>[];
  priceAsOf: Date | null;
  warnings: string[];
  summary: HoldingsValuationSummary;
};

type PriceMeta = {
  ltp: number;
  previousClose: number | null;
  source: string;
  timestamp: Date;
  freshness: PriceFreshness;
};

type InstrumentEntry = {
  id: string;
  symbol: string;
  exchange: string;
  securityId: string | null;
};

@Injectable()
export class HoldingsValuationService {
  private readonly logger = new Logger(HoldingsValuationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: DhanMarketDataProviderService,
  ) {}

  async value<T extends ValuationInputHolding>(
    userId: string,
    holdings: T[],
    asOf: Date = new Date(),
    options: { preferCachedPrices?: boolean } = {},
  ): Promise<HoldingsValuationResult<T>> {
    if (holdings.length === 0) {
      return {
        holdings: [],
        priceAsOf: null,
        warnings: [],
        summary: emptySummary(),
      };
    }

    const valuableHoldings = holdings.filter(
      (holding): holding is T & { securityId: string; exchange: string } =>
        Boolean(holding.securityId) && Boolean(holding.exchange),
    );

    const instrumentByKey =
      valuableHoldings.length > 0
        ? await this.ensureInstruments(valuableHoldings)
        : new Map<string, InstrumentEntry>();

    const latestPriceByInstrument = await this.findLatestPrices(
      Array.from(instrumentByKey.values()).map((entry) => entry.id),
    );

    const priceByKey = new Map<string, PriceMeta>();
    const stalePending: Array<T & { securityId: string; exchange: string }> =
      [];

    for (const holding of valuableHoldings) {
      const key = this.holdingKey(holding);
      const instrument = instrumentByKey.get(key);
      if (!instrument) {
        stalePending.push(holding);
        continue;
      }

      const existing = latestPriceByInstrument.get(instrument.id);
      if (existing && this.isFresh(existing.timestamp, asOf)) {
        priceByKey.set(key, this.toPriceMeta(existing, asOf));
        continue;
      }

      stalePending.push(holding);
    }

    const fetchWarnings: string[] = [];
    let bulkPrices = new Map<string, BulkProviderPrice>();

    if (stalePending.length > 0 && !options.preferCachedPrices) {
      try {
        bulkPrices = await this.provider.fetchLatestPricesBulk(
          userId,
          stalePending.map((holding) => ({
            exchange: holding.exchange,
            securityId: holding.securityId,
          })),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Bulk Dhan quote fetch failed for ${stalePending.length} holdings: ${message}`,
        );
        fetchWarnings.push(
          `Live market quotes failed: ${truncateError(message)}. Showing average cost as current value.`,
        );
      }

      if (bulkPrices.size === 0 && fetchWarnings.length === 0) {
        fetchWarnings.push(
          'Dhan returned no quotes for the requested securities. Verify market-data API access on your Dhan account.',
        );
      } else if (bulkPrices.size > 0 && bulkPrices.size < stalePending.length) {
        const missing = stalePending.length - bulkPrices.size;
        fetchWarnings.push(
          `${missing} holding(s) had no live quote in the Dhan response.`,
        );
      }
    }

    if (bulkPrices.size > 0) {
      await this.persistBulkPrices(bulkPrices, instrumentByKey, asOf);
    }

    for (const holding of stalePending) {
      const key = this.holdingKey(holding);
      const bulkKey = this.provider.bulkKey(
        holding.exchange,
        holding.securityId,
      );
      const fresh = bulkPrices.get(bulkKey);

      if (fresh) {
        priceByKey.set(key, {
          ltp: fresh.ltp,
          previousClose: fresh.previousClose,
          source: fresh.source,
          timestamp: fresh.timestamp,
          freshness: 'LIVE',
        });
        continue;
      }

      const instrument = instrumentByKey.get(key);
      const stored = instrument
        ? latestPriceByInstrument.get(instrument.id)
        : undefined;

      if (stored) {
        priceByKey.set(key, this.toPriceMeta(stored, asOf));
      }
    }

    const valued = holdings.map((holding) =>
      this.valueHolding(holding, priceByKey),
    );
    const summary = this.summarize(valued);
    const priceAsOf = latestTimestamp(priceByKey);
    const warnings = [...fetchWarnings, ...this.dataQualityWarnings(summary)];

    return { holdings: valued, priceAsOf, warnings, summary };
  }

  private valueHolding<T extends ValuationInputHolding>(
    holding: T,
    priceByKey: Map<string, PriceMeta>,
  ): ValuedHolding<T> {
    const investedValue = roundMoney(holding.costValue);
    const warnings: string[] = [];

    if (!holding.securityId) {
      warnings.push('SECURITY_ID_MISSING');
    }

    const price =
      holding.securityId && holding.exchange
        ? priceByKey.get(this.holdingKey(holding))
        : undefined;

    if (!price) {
      const fallbackWarning = holding.securityId
        ? 'PRICE_UNAVAILABLE'
        : 'PRICE_UNAVAILABLE_NO_SECURITY_ID';
      warnings.push(fallbackWarning);

      return {
        ...holding,
        ltp: null,
        previousClose: null,
        investedValue,
        currentValue: investedValue,
        marketValue: investedValue,
        pnl: 0,
        pnlPercent: null,
        dayPnl: null,
        dayPnlPercent: null,
        priceSource: null,
        priceTimestamp: null,
        priceFreshness: 'FALLBACK',
        warnings,
      };
    }

    const currentValue = roundMoney(holding.totalQty * price.ltp);
    const pnl = roundMoney(currentValue - investedValue);
    const pnlPercent =
      investedValue > 0 ? roundPercent((pnl / investedValue) * 100) : null;

    let dayPnl: number | null = null;
    let dayPnlPercent: number | null = null;
    if (price.previousClose != null && price.previousClose > 0) {
      const previousValue = roundMoney(holding.totalQty * price.previousClose);
      dayPnl = roundMoney(currentValue - previousValue);
      dayPnlPercent =
        previousValue > 0 ? roundPercent((dayPnl / previousValue) * 100) : null;
    }

    if (price.freshness === 'STALE' || price.freshness === 'MISSING') {
      warnings.push('PRICE_STALE');
    }

    return {
      ...holding,
      ltp: price.ltp,
      previousClose: price.previousClose,
      investedValue,
      currentValue,
      marketValue: currentValue,
      pnl,
      pnlPercent,
      dayPnl,
      dayPnlPercent,
      priceSource: price.source,
      priceTimestamp: price.timestamp,
      priceFreshness: price.freshness,
      warnings,
    };
  }

  private summarize<T extends ValuationInputHolding>(
    valued: ValuedHolding<T>[],
  ): HoldingsValuationSummary {
    let invested = 0;
    let currentValue = 0;
    let stockInvested = 0;
    let stockCurrentValue = 0;
    let etfInvested = 0;
    let etfCurrentValue = 0;
    let dayPnl = 0;
    let previousValue = 0;
    let pricedCount = 0;
    let fallbackCount = 0;
    let dayCoverage = 0;

    for (const holding of valued) {
      invested += holding.investedValue;
      currentValue += holding.currentValue;

      if (holding.assetClass === 'STOCK') {
        stockInvested += holding.investedValue;
        stockCurrentValue += holding.currentValue;
      } else if (holding.assetClass === 'ETF') {
        etfInvested += holding.investedValue;
        etfCurrentValue += holding.currentValue;
      }

      if (
        holding.priceFreshness === 'LIVE' ||
        holding.priceFreshness === 'RECENT' ||
        holding.priceFreshness === 'STALE'
      ) {
        pricedCount += 1;
      } else {
        fallbackCount += 1;
      }

      if (holding.dayPnl != null && holding.previousClose != null) {
        dayPnl += holding.dayPnl;
        previousValue += holding.totalQty * holding.previousClose;
        dayCoverage += 1;
      }
    }

    const pnl = roundMoney(currentValue - invested);
    const pnlPercent =
      invested > 0 ? roundPercent((pnl / invested) * 100) : null;
    const hasDay = dayCoverage > 0 && previousValue > 0;
    const dayPnlRounded = hasDay ? roundMoney(dayPnl) : null;
    const dayPnlPercentValue = hasDay
      ? roundPercent((dayPnl / previousValue) * 100)
      : null;

    return {
      holdingCount: valued.length,
      pricedCount,
      fallbackCount,
      invested: roundMoney(invested),
      currentValue: roundMoney(currentValue),
      pnl,
      pnlPercent,
      dayPnl: dayPnlRounded,
      dayPnlPercent: dayPnlPercentValue,
      stockInvested: roundMoney(stockInvested),
      stockCurrentValue: roundMoney(stockCurrentValue),
      etfInvested: roundMoney(etfInvested),
      etfCurrentValue: roundMoney(etfCurrentValue),
    };
  }

  private async ensureInstruments(
    holdings: Array<
      ValuationInputHolding & { securityId: string; exchange: string }
    >,
  ) {
    const seen = new Map<
      string,
      ValuationInputHolding & { securityId: string; exchange: string }
    >();

    for (const holding of holdings) {
      const key = this.holdingKey(holding);
      if (!seen.has(key)) {
        seen.set(key, holding);
      }
    }

    const uniqueHoldings = Array.from(seen.values());
    const existing = await this.prisma.instrument.findMany({
      where: {
        OR: uniqueHoldings.map((holding) => ({
          symbol: holding.tradingSymbol,
          exchange: this.exchangeKey(holding.exchange),
        })),
      },
    });

    const byKey = new Map<string, InstrumentEntry>();
    for (const instrument of existing) {
      byKey.set(`${instrument.symbol}@${instrument.exchange}`, {
        id: instrument.id,
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        securityId: instrument.securityId,
      });
    }

    const missing = uniqueHoldings.filter(
      (holding) => !byKey.has(this.holdingKey(holding)),
    );

    for (const holding of missing) {
      const exchange = this.exchangeKey(holding.exchange);
      const created = await this.prisma.instrument.upsert({
        where: {
          symbol_exchange: {
            symbol: holding.tradingSymbol,
            exchange,
          },
        },
        create: {
          symbol: holding.tradingSymbol,
          exchange,
          securityId: holding.securityId,
          isin: holding.isin,
          name: holding.tradingSymbol,
          instrumentType: holding.assetClass === 'ETF' ? 'ETF' : 'EQUITY',
          source: 'DHAN_HOLDINGS',
          lastVerifiedAt: new Date(),
        },
        update: {
          securityId: holding.securityId,
          isin: holding.isin,
          isActive: true,
          lastVerifiedAt: new Date(),
        },
      });

      byKey.set(this.holdingKey(holding), {
        id: created.id,
        symbol: created.symbol,
        exchange: created.exchange,
        securityId: created.securityId,
      });
    }

    return byKey;
  }

  private async findLatestPrices(instrumentIds: string[]) {
    if (instrumentIds.length === 0) {
      return new Map<string, StoredPrice>();
    }

    const rows = await this.prisma.priceSnapshot.findMany({
      where: { instrumentId: { in: instrumentIds } },
      orderBy: [{ instrumentId: 'asc' }, { timestamp: 'desc' }],
    });

    const latest = new Map<string, StoredPrice>();
    for (const row of rows) {
      if (latest.has(row.instrumentId)) {
        continue;
      }

      latest.set(row.instrumentId, {
        ltp: row.ltp.toNumber(),
        previousClose: row.previousClose ? row.previousClose.toNumber() : null,
        source: row.source,
        timestamp: row.timestamp,
      });
    }

    return latest;
  }

  private async persistBulkPrices(
    bulkPrices: Map<string, BulkProviderPrice>,
    instrumentByKey: Map<string, InstrumentEntry>,
    asOf: Date,
  ) {
    const writes: Promise<unknown>[] = [];

    for (const instrument of instrumentByKey.values()) {
      if (!instrument.securityId) {
        continue;
      }
      const bulkKey = this.provider.bulkKey(
        instrument.exchange,
        instrument.securityId,
      );
      const price = bulkPrices.get(bulkKey);

      if (!price) {
        continue;
      }

      writes.push(
        this.prisma.priceSnapshot.create({
          data: {
            instrumentId: instrument.id,
            ltp: price.ltp,
            open: price.open,
            high: price.high,
            low: price.low,
            previousClose: price.previousClose,
            volume:
              price.volume == null ? null : BigInt(Math.trunc(price.volume)),
            source: price.source,
            timestamp: price.timestamp,
            freshness: 'LIVE',
            dataQuality: { freshness: 'LIVE', confidence: 'HIGH' },
            warnings: [],
            rawPayload: this.toJson(price.rawPayload),
          },
        }),
      );
    }

    if (writes.length > 0) {
      await Promise.all(writes);
    }

    void asOf;
  }

  private isFresh(timestamp: Date, asOf: Date) {
    return asOf.getTime() - timestamp.getTime() < FRESHNESS_WINDOW_MS;
  }

  private toPriceMeta(stored: StoredPrice, asOf: Date): PriceMeta {
    const age = asOf.getTime() - stored.timestamp.getTime();
    let freshness: PriceFreshness;

    if (age < FRESHNESS_WINDOW_MS) {
      freshness = 'LIVE';
    } else if (age < STALE_WINDOW_MS) {
      freshness = 'RECENT';
    } else {
      freshness = 'STALE';
    }

    return {
      ltp: stored.ltp,
      previousClose: stored.previousClose,
      source: stored.source,
      timestamp: stored.timestamp,
      freshness,
    };
  }

  private holdingKey(holding: {
    tradingSymbol: string;
    exchange: string | null;
  }) {
    return `${holding.tradingSymbol}@${this.exchangeKey(holding.exchange)}`;
  }

  private exchangeKey(exchange: string | null) {
    const normalized = (exchange ?? 'NSE').trim().toUpperCase();

    if (normalized === 'BSE' || normalized.includes('BSE')) {
      return 'BSE';
    }

    return 'NSE';
  }

  private dataQualityWarnings(summary: HoldingsValuationSummary) {
    const warnings: string[] = [];

    if (summary.fallbackCount > 0 && summary.holdingCount > 0) {
      warnings.push(
        `${summary.fallbackCount} holding(s) priced from average cost; live quotes unavailable.`,
      );
    }

    return warnings;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

type StoredPrice = {
  ltp: number;
  previousClose: number | null;
  source: string;
  timestamp: Date;
};

function emptySummary(): HoldingsValuationSummary {
  return {
    holdingCount: 0,
    pricedCount: 0,
    fallbackCount: 0,
    invested: 0,
    currentValue: 0,
    pnl: 0,
    pnlPercent: null,
    dayPnl: null,
    dayPnlPercent: null,
    stockInvested: 0,
    stockCurrentValue: 0,
    etfInvested: 0,
    etfCurrentValue: 0,
  };
}

function latestTimestamp(priceByKey: Map<string, PriceMeta>) {
  let latest: Date | null = null;

  for (const price of priceByKey.values()) {
    if (!latest || price.timestamp.getTime() > latest.getTime()) {
      latest = price.timestamp;
    }
  }

  return latest;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function truncateError(message: string, max = 240) {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
