import { BadRequestException, Injectable } from '@nestjs/common';
import { DhanClient } from '../broker/dhan/dhan.client';

type MarketDataInstrument = {
  id: string;
  symbol: string;
  exchange: string;
  securityId: string | null;
  instrumentType: string;
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
