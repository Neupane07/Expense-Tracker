import { Injectable } from '@nestjs/common';
import { CandlesService } from './candles.service';
import { IndicatorsService } from './indicators.service';
import { InstrumentsService } from './instruments.service';
import { PricesService } from './prices.service';

@Injectable()
export class MarketDataService {
  constructor(
    private readonly instruments: InstrumentsService,
    private readonly prices: PricesService,
    private readonly candles: CandlesService,
    private readonly indicators: IndicatorsService,
  ) {}

  getStatus() {
    return {
      module: 'market-data',
      status: 'read-only',
    };
  }

  async getInstrument(userId: string, symbol: string) {
    const instrument = await this.instruments.findBySymbol(userId, symbol);
    return this.instruments.serialize(instrument);
  }

  getLatestPrice(userId: string, symbol: string) {
    return this.prices.getLatest(userId, symbol);
  }

  getCandles(
    userId: string,
    symbol: string,
    query: { from?: string; to?: string },
  ) {
    return this.candles.getDailyCandles(userId, symbol, query);
  }

  getLatestIndicators(userId: string, symbol: string) {
    return this.indicators.getLatest(userId, symbol);
  }

  recalculateIndicators(userId: string, symbol: string) {
    return this.indicators.recalculate(userId, symbol);
  }
}
