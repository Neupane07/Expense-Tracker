import { BadRequestException, Injectable } from '@nestjs/common';
import { DhanClient } from '../broker/dhan/dhan.client';

type MarketDataInstrument = {
  id: string;
  symbol: string;
  exchange: string;
  securityId: string | null;
  instrumentType: string;
};

export type BulkPriceInstrument = {
  exchange: string;
  securityId: string | null;
};

export type BulkProviderPrice = {
  securityId: string;
  exchangeSegment: string;
  ltp: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume: number | null;
  source: string;
  timestamp: Date;
  rawPayload: unknown;
};

@Injectable()
export class DhanMarketDataProviderService {
  readonly source = 'DHAN';

  constructor(private readonly dhanClient: DhanClient) {}

  async fetchLatestPrice(userId: string, instrument: MarketDataInstrument) {
    const securityId = this.requireSecurityId(instrument);
    const exchangeSegment = this.toExchangeSegment(instrument.exchange);
    const response = await this.dhanClient.getMarketQuote(
      userId,
      exchangeSegment,
      securityId,
    );
    const rows = response.data?.[exchangeSegment] ?? {};
    const quote = rows[securityId] ?? rows[String(Number(securityId))];

    if (!quote?.last_price) {
      throw new BadRequestException(
        `Dhan did not return a latest price for ${instrument.symbol}.`,
      );
    }

    return {
      ltp: quote.last_price,
      open: quote.ohlc?.open ?? null,
      high: quote.ohlc?.high ?? null,
      low: quote.ohlc?.low ?? null,
      previousClose: quote.ohlc?.close ?? null,
      volume: quote.volume ?? null,
      source: this.source,
      timestamp: new Date(),
      rawPayload: response,
    };
  }

  async fetchLatestPricesBulk(
    userId: string,
    instruments: BulkPriceInstrument[],
  ): Promise<Map<string, BulkProviderPrice>> {
    const result = new Map<string, BulkProviderPrice>();
    const idsBySegment = new Map<string, Set<string>>();

    for (const instrument of instruments) {
      if (!instrument.securityId) {
        continue;
      }

      const segment = this.toExchangeSegment(instrument.exchange);
      const existing = idsBySegment.get(segment) ?? new Set<string>();
      existing.add(instrument.securityId);
      idsBySegment.set(segment, existing);
    }

    if (idsBySegment.size === 0) {
      return result;
    }

    const errors: string[] = [];

    for (const [segment, idSet] of idsBySegment) {
      const ids = Array.from(idSet);

      try {
        const response = await this.dhanClient.getMarketQuotes(userId, {
          [segment]: ids,
        });
        const timestamp = new Date();
        const rows = response.data?.[segment] ?? {};

        for (const securityId of ids) {
          const quote = rows[securityId] ?? rows[String(Number(securityId))];

          if (!quote?.last_price) {
            continue;
          }

          result.set(this.bulkKey(segment, securityId), {
            securityId,
            exchangeSegment: segment,
            ltp: quote.last_price,
            open: quote.ohlc?.open ?? null,
            high: quote.ohlc?.high ?? null,
            low: quote.ohlc?.low ?? null,
            previousClose: quote.ohlc?.close ?? null,
            volume: quote.volume ?? null,
            source: this.source,
            timestamp,
            rawPayload: quote,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${segment}: ${message}`);
      }
    }

    if (result.size === 0 && errors.length > 0) {
      throw new Error(`Dhan quote fetch failed - ${errors.join(' | ')}`);
    }

    return result;
  }

  bulkKey(exchange: string, securityId: string) {
    return `${this.toExchangeSegment(exchange)}:${securityId}`;
  }

  async fetchDailyCandles(
    userId: string,
    instrument: MarketDataInstrument,
    fromDate: Date,
    toDate: Date,
  ) {
    const securityId = this.requireSecurityId(instrument);
    const response = await this.dhanClient.getHistoricalDailyCandles(userId, {
      securityId,
      exchangeSegment: this.toExchangeSegment(instrument.exchange),
      instrument: this.toDhanInstrument(instrument.instrumentType),
      fromDate: formatDate(fromDate),
      toDate: formatDate(toDate),
    });
    const timestamps = response.timestamp ?? [];

    return timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000),
      open: response.open?.[index] ?? 0,
      high: response.high?.[index] ?? 0,
      low: response.low?.[index] ?? 0,
      close: response.close?.[index] ?? 0,
      volume: response.volume?.[index] ?? null,
      source: this.source,
      isAdjusted: false,
      rawPayload: {
        timestamp,
        open: response.open?.[index],
        high: response.high?.[index],
        low: response.low?.[index],
        close: response.close?.[index],
        volume: response.volume?.[index],
      },
    }));
  }

  private requireSecurityId(instrument: MarketDataInstrument) {
    if (!instrument.securityId) {
      throw new BadRequestException(
        `Instrument ${instrument.symbol} is missing a Dhan securityId.`,
      );
    }

    return instrument.securityId;
  }

  private toExchangeSegment(exchange: string) {
    const normalized = exchange.trim().toUpperCase();

    if (normalized.includes('_')) {
      return normalized;
    }

    if (normalized === 'BSE') {
      return 'BSE_EQ';
    }

    return 'NSE_EQ';
  }

  private toDhanInstrument(instrumentType: string) {
    return instrumentType.trim().toUpperCase() === 'ETF' ? 'EQUITY' : 'EQUITY';
  }
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
