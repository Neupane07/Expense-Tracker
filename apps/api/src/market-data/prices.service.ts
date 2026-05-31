import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DhanMarketDataProviderService } from './dhan-market-data-provider.service';
import { InstrumentsService } from './instruments.service';
import { MarketDataQualityService } from './market-data-quality.service';

type DecimalLike = {
  toNumber(): number;
};

@Injectable()
export class PricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instruments: InstrumentsService,
    private readonly provider: DhanMarketDataProviderService,
    private readonly quality: MarketDataQualityService,
  ) {}

  async getLatest(userId: string, symbol: string) {
    const instrument = await this.instruments.findBySymbol(userId, symbol);
    let price = await this.prisma.priceSnapshot.findFirst({
      where: { instrumentId: instrument.id },
      orderBy: { timestamp: 'desc' },
    });

    if (instrument.securityId) {
      const providerPrice = await this.provider.fetchLatestPrice(
        userId,
        instrument,
      );
      const quality = this.quality.priceQuality(providerPrice.timestamp);
      price = await this.prisma.priceSnapshot.create({
        data: {
          instrumentId: instrument.id,
          ltp: providerPrice.ltp,
          open: providerPrice.open,
          high: providerPrice.high,
          low: providerPrice.low,
          previousClose: providerPrice.previousClose,
          volume:
            providerPrice.volume == null
              ? null
              : BigInt(Math.trunc(providerPrice.volume)),
          source: providerPrice.source,
          timestamp: providerPrice.timestamp,
          freshness: quality.dataQuality.freshness,
          dataQuality: quality.dataQuality,
          warnings: quality.warnings,
          rawPayload: providerPrice.rawPayload,
        },
      });
    }

    const quality = this.quality.priceQuality(price?.timestamp ?? null);

    return {
      instrument: this.instruments.serialize(instrument),
      price: price ? this.serialize(price) : null,
      source: price?.source ?? this.provider.source,
      asOf: price?.timestamp ?? new Date(),
      timestamp: price?.timestamp ?? null,
      dataQuality: price?.dataQuality ?? quality.dataQuality,
      warnings: price?.warnings?.length ? price.warnings : quality.warnings,
    };
  }

  serialize(price: {
    id: string;
    ltp: DecimalLike;
    open: DecimalLike | null;
    high: DecimalLike | null;
    low: DecimalLike | null;
    previousClose: DecimalLike | null;
    volume: bigint | null;
    source: string;
    timestamp: Date;
    freshness: string;
    dataQuality: Prisma.JsonValue;
    warnings: string[];
  }) {
    return {
      id: price.id,
      ltp: price.ltp.toNumber(),
      open: price.open?.toNumber() ?? null,
      high: price.high?.toNumber() ?? null,
      low: price.low?.toNumber() ?? null,
      previousClose: price.previousClose?.toNumber() ?? null,
      volume: price.volume == null ? null : Number(price.volume),
      source: price.source,
      timestamp: price.timestamp,
      freshness: price.freshness,
      dataQuality: price.dataQuality,
      warnings: price.warnings,
    };
  }
}
