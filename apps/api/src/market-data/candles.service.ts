import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CorporateActionPolicyService } from './corporate-action-policy.service';
import { DHAN_CANDLE_ADJUSTMENT_POLICY } from './corporate-action.constants';
import { DhanMarketDataProviderService } from './dhan-market-data-provider.service';
import { InstrumentsService } from './instruments.service';
import { MarketDataQualityService } from './market-data-quality.service';

type DecimalLike = {
  toNumber(): number;
};

@Injectable()
export class CandlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instruments: InstrumentsService,
    private readonly provider: DhanMarketDataProviderService,
    private readonly quality: MarketDataQualityService,
    private readonly corporateActionPolicy: CorporateActionPolicyService,
  ) {}

  async getDailyCandles(
    userId: string,
    symbol: string,
    input: { from?: string; to?: string } = {},
  ) {
    const instrument = await this.instruments.findBySymbol(userId, symbol);
    const toDate = input.to ? new Date(input.to) : new Date();
    const fromDate = input.from
      ? new Date(input.from)
      : new Date(toDate.getTime() - 370 * 24 * 60 * 60 * 1000);

    let candles = await this.findCandles(instrument.id, fromDate, toDate);

    if (candles.length === 0 && instrument.securityId) {
      const providerCandles = await this.provider.fetchDailyCandles(
        userId,
        instrument,
        fromDate,
        toDate,
      );

      for (const candle of providerCandles) {
        if (!candle.open || !candle.high || !candle.low || !candle.close) {
          continue;
        }

        const verifiedAt = new Date();
        const dataQuality =
          this.corporateActionPolicy.buildCandleAdjustmentDataQuality(
            verifiedAt,
          );

        await this.prisma.dailyCandle.upsert({
          where: {
            instrumentId_date_source: {
              instrumentId: instrument.id,
              date: candle.date,
              source: candle.source,
            },
          },
          create: {
            instrumentId: instrument.id,
            date: candle.date,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume:
              candle.volume == null ? null : BigInt(Math.trunc(candle.volume)),
            source: candle.source,
            isAdjusted: candle.isAdjusted,
            dataQuality,
            warnings: [],
            rawPayload: candle.rawPayload,
          },
          update: {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume:
              candle.volume == null ? null : BigInt(Math.trunc(candle.volume)),
            isAdjusted: candle.isAdjusted,
            dataQuality,
            warnings: [],
            rawPayload: candle.rawPayload,
          },
        });
      }

      candles = await this.findCandles(instrument.id, fromDate, toDate);
    }

    const warnings = this.quality.candleWarnings(candles.length);

    return {
      instrument: this.instruments.serialize(instrument),
      candles: candles.map((candle) => this.serialize(candle)),
      source: candles[0]?.source ?? this.provider.source,
      asOf: candles.at(-1)?.date ?? new Date(),
      timestamp: candles.at(-1)?.date ?? null,
      dataQuality: {
        freshness: candles.length > 0 ? 'RECENT' : 'MISSING',
        confidence: warnings.length === 0 ? 'HIGH' : 'LOW',
      },
      warnings,
    };
  }

  async getCandlesForIndicators(userId: string, symbol: string) {
    const response = await this.getDailyCandles(userId, symbol);

    if (response.candles.length === 0) {
      throw new BadRequestException(
        `Daily candles are missing for ${symbol}; indicators cannot be calculated.`,
      );
    }

    return response;
  }

  private findCandles(instrumentId: string, fromDate: Date, toDate: Date) {
    return this.prisma.dailyCandle.findMany({
      where: {
        instrumentId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  serialize(candle: {
    id: string;
    date: Date;
    open: DecimalLike;
    high: DecimalLike;
    low: DecimalLike;
    close: DecimalLike;
    volume: bigint | null;
    source: string;
    isAdjusted: boolean;
    dataQuality?: unknown;
    warnings: string[];
  }) {
    return {
      id: candle.id,
      date: candle.date,
      open: candle.open.toNumber(),
      high: candle.high.toNumber(),
      low: candle.low.toNumber(),
      close: candle.close.toNumber(),
      volume: candle.volume == null ? null : Number(candle.volume),
      source: candle.source,
      isAdjusted: candle.isAdjusted,
      adjustmentPolicy:
        typeof candle.dataQuality === 'object' &&
        candle.dataQuality != null &&
        'adjustmentPolicy' in candle.dataQuality
          ? String(
              (candle.dataQuality as { adjustmentPolicy?: string })
                .adjustmentPolicy,
            )
          : candle.isAdjusted
            ? DHAN_CANDLE_ADJUSTMENT_POLICY
            : null,
      warnings: candle.warnings,
    };
  }
}
