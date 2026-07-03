import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculateIndicators,
  type IndicatorCandle,
} from './indicator-calculations';
import { CandlesService } from './candles.service';
import { CorporateActionSyncService } from './corporate-action.service';
import { InstrumentsService } from './instruments.service';

type DecimalLike = {
  toNumber(): number;
};

@Injectable()
export class IndicatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instruments: InstrumentsService,
    private readonly candles: CandlesService,
    private readonly corporateActions: CorporateActionSyncService,
  ) {}

  async getLatest(userId: string, symbol: string) {
    const instrument = await this.instruments.findBySymbol(userId, symbol);
    const latest = await this.prisma.technicalIndicatorSnapshot.findFirst({
      where: { instrumentId: instrument.id },
      orderBy: { asOfDate: 'desc' },
    });

    if (!latest) {
      return this.recalculate(userId, symbol);
    }

    return {
      instrument: this.instruments.serialize(instrument),
      indicators: this.serialize(latest),
      source: latest.source,
      asOf: latest.asOfDate,
      timestamp: latest.asOfDate,
      dataQuality: latest.dataQuality,
      warnings: latest.warnings,
    };
  }

  async recalculate(userId: string, symbol: string) {
    const instrument = await this.instruments.findBySymbol(userId, symbol);
    const candleResponse = await this.candles.getCandlesForIndicators(
      userId,
      symbol,
    );
    const policy = await this.corporateActions.evaluateForInstrument(
      {
        id: instrument.id,
        symbol: instrument.symbol,
        exchange: instrument.exchange,
      },
      candleResponse.candles.map((candle) => ({
        source: candle.source,
        isAdjusted: candle.isAdjusted,
        dataQuality: candle.adjustmentPolicy
          ? { adjustmentPolicy: candle.adjustmentPolicy }
          : null,
      })),
    );

    if (policy.blocksHistoricalAnalysis) {
      throw new BadRequestException(
        `Corporate-action adjustment is not verified for ${symbol}; indicators cannot be recalculated.`,
      );
    }

    const indicatorCandles: IndicatorCandle[] = candleResponse.candles.map(
      (candle) => ({
        date: new Date(candle.date),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      }),
    );
    const values = calculateIndicators(indicatorCandles);
    const asOfDate = indicatorCandles.at(-1)?.date ?? new Date();
    const snapshot = await this.prisma.technicalIndicatorSnapshot.upsert({
      where: {
        instrumentId_asOfDate_source: {
          instrumentId: instrument.id,
          asOfDate,
          source: candleResponse.source,
        },
      },
      create: {
        instrumentId: instrument.id,
        asOfDate,
        sma20: values.sma20,
        sma50: values.sma50,
        sma200: values.sma200,
        rsi14: values.rsi14,
        atr14: values.atr14,
        volumeAverage20: values.volumeAverage20,
        volumeRatio: values.volumeRatio,
        distanceFromSma50: values.distanceFromSma50,
        source: candleResponse.source,
        dataQuality: {
          confidence: values.warnings.length === 0 ? 'HIGH' : 'MEDIUM',
        },
        warnings: values.warnings,
      },
      update: {
        sma20: values.sma20,
        sma50: values.sma50,
        sma200: values.sma200,
        rsi14: values.rsi14,
        atr14: values.atr14,
        volumeAverage20: values.volumeAverage20,
        volumeRatio: values.volumeRatio,
        distanceFromSma50: values.distanceFromSma50,
        dataQuality: {
          confidence: values.warnings.length === 0 ? 'HIGH' : 'MEDIUM',
        },
        warnings: values.warnings,
      },
    });

    return {
      instrument: this.instruments.serialize(instrument),
      indicators: this.serialize(snapshot),
      source: snapshot.source,
      asOf: snapshot.asOfDate,
      timestamp: snapshot.asOfDate,
      dataQuality: snapshot.dataQuality,
      warnings: snapshot.warnings,
    };
  }

  private serialize(snapshot: {
    id: string;
    asOfDate: Date;
    sma20: DecimalLike | null;
    sma50: DecimalLike | null;
    sma200: DecimalLike | null;
    rsi14: DecimalLike | null;
    atr14: DecimalLike | null;
    volumeAverage20: DecimalLike | null;
    volumeRatio: DecimalLike | null;
    distanceFromSma50: DecimalLike | null;
    source: string;
    dataQuality: Prisma.JsonValue;
    warnings: string[];
  }) {
    return {
      id: snapshot.id,
      asOfDate: snapshot.asOfDate,
      sma20: snapshot.sma20?.toNumber() ?? null,
      sma50: snapshot.sma50?.toNumber() ?? null,
      sma200: snapshot.sma200?.toNumber() ?? null,
      rsi14: snapshot.rsi14?.toNumber() ?? null,
      atr14: snapshot.atr14?.toNumber() ?? null,
      volumeAverage20: snapshot.volumeAverage20?.toNumber() ?? null,
      volumeRatio: snapshot.volumeRatio?.toNumber() ?? null,
      distanceFromSma50: snapshot.distanceFromSma50?.toNumber() ?? null,
      source: snapshot.source,
      dataQuality: snapshot.dataQuality,
      warnings: snapshot.warnings,
    };
  }
}
