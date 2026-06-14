import { Injectable, NotFoundException } from '@nestjs/common';
import { PortfolioAssetClass } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InstrumentVerificationService } from '../../market-data/instrument-verification.service';
import { MarketDataQualityService } from '../../market-data/market-data-quality.service';
import { InstrumentsService } from '../../market-data/instruments.service';
import { CandlesService } from '../../market-data/candles.service';
import { IndicatorsService } from '../../market-data/indicators.service';
import { PricesService } from '../../market-data/prices.service';
import type { ToolContext, ToolHandlerResult } from '../tool.types';
import { evaluateCandleCorporateActionPolicy } from '../corporate-action-check';
import {
  marketDataStatusInputSchema,
  type MarketDataStatusInput,
} from '../tool-schemas';
import { marketDataStatusOutputSchema } from '../tool-output-schemas';

@Injectable()
export class GetMarketDataStatusTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instruments: InstrumentsService,
    private readonly prices: PricesService,
    private readonly candles: CandlesService,
    private readonly indicators: IndicatorsService,
    private readonly marketQuality: MarketDataQualityService,
    private readonly instrumentVerification: InstrumentVerificationService,
  ) {}

  readonly definition = {
    name: 'get_market_data_status',
    version: '1',
    description:
      'Read-only market-data readiness for holdings or explicit symbols (mapping, price, candles, indicators).',
    readOnly: true as const,
    inputSchema: marketDataStatusInputSchema,
    outputSchema: marketDataStatusOutputSchema,
    handler: (context: ToolContext, input: MarketDataStatusInput) =>
      this.handle(context, input),
  };

  async handle(
    context: ToolContext,
    input: MarketDataStatusInput,
  ): Promise<ToolHandlerResult> {
    const asOf = new Date();
    const universe = await this.resolveUniverse(context.userId, input);
    const symbols: Array<{
      symbol: string;
      status: string;
      warnings: string[];
      blockers: string[];
      [key: string]: unknown;
    }> = [];
    const warnings: string[] = [];
    const rejectReasons: string[] = [];

    if (universe.length === 0) {
      return {
        status: 'unavailable',
        data: {
          universe: [],
          universeSource: input.symbols?.length ? 'symbols' : 'holdings',
          symbols: [],
        },
        dataQuality: { freshness: 'MISSING', confidence: 'LOW' },
        warnings: ['MARKET_DATA_UNIVERSE_EMPTY'],
        rejectReasons: ['MARKET_DATA_UNIVERSE_EMPTY'],
        asOf,
      };
    }

    for (const symbol of universe) {
      const status = await this.checkSymbol(context.userId, symbol, asOf);
      symbols.push(status);
      warnings.push(...status.warnings);
      rejectReasons.push(...status.blockers);
    }

    const blocked = symbols.some((row) => row.status === 'BLOCKED');
    const degraded = symbols.some((row) => row.status === 'DEGRADED');

    return {
      status: blocked ? 'unavailable' : degraded ? 'rejected' : 'ok',
      data: {
        universe,
        universeSource: input.symbols?.length ? 'symbols' : 'holdings',
        symbols,
      },
      dataQuality: {
        freshness: blocked ? 'MISSING' : degraded ? 'STALE' : 'RECENT',
        confidence: blocked ? 'LOW' : degraded ? 'MEDIUM' : 'HIGH',
      },
      warnings: [...new Set(warnings)],
      rejectReasons: [...new Set(rejectReasons)],
      asOf,
    };
  }

  private async checkSymbol(userId: string, symbol: string, asOf: Date) {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const warnings: string[] = [];
    const blockers: string[] = [];

    try {
      const instrument = await this.instruments.findBySymbol(
        userId,
        normalizedSymbol,
      );
      const mapping = this.instrumentVerification.evaluateInstrumentMapping({
        symbol: normalizedSymbol,
        securityId: instrument.securityId,
        source: instrument.source,
        lastVerifiedAt: instrument.lastVerifiedAt,
        isActive: instrument.isActive,
      });
      warnings.push(...mapping.warnings);
      blockers.push(...mapping.blockers);

      const price = await this.prices.getLatest(userId, normalizedSymbol);
      const priceTimestamp =
        price?.price?.timestamp ?? price?.timestamp ?? null;
      const priceQuality = this.marketQuality.priceQuality(
        priceTimestamp ? new Date(priceTimestamp) : null,
        asOf,
      );
      warnings.push(...priceQuality.warnings);
      if (priceQuality.dataQuality.freshness === 'MISSING') {
        blockers.push('PRICE_MISSING');
      }
      if (priceQuality.dataQuality.freshness === 'STALE') {
        blockers.push('PRICE_STALE');
      }

      const candleResponse = await this.candles.getDailyCandles(
        userId,
        normalizedSymbol,
        {},
      );
      const candleRows = Array.isArray(candleResponse.candles)
        ? candleResponse.candles
        : [];
      const candleCount = candleRows.length;
      warnings.push(...this.marketQuality.candleWarnings(candleCount));
      if (candleCount === 0) {
        blockers.push('CANDLES_MISSING');
      }

      const corporateAction = evaluateCandleCorporateActionPolicy(
        this.instrumentVerification,
        candleRows,
      );
      warnings.push(...corporateAction.warnings);
      blockers.push(...corporateAction.blockers);
      if (corporateAction.blocksHistoricalAnalysis) {
        blockers.push('HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT');
      }

      const indicatorResponse = await this.indicators.getLatest(
        userId,
        normalizedSymbol,
      );
      if (!indicatorResponse.indicators) {
        warnings.push('INDICATORS_MISSING');
      }

      const status =
        blockers.length > 0
          ? 'BLOCKED'
          : warnings.length > 0
            ? 'DEGRADED'
            : 'READY';

      return {
        symbol: normalizedSymbol,
        status,
        mappingStatus: mapping.mappingStatus,
        price: {
          source: price?.price?.source ?? price?.source ?? null,
          asOf: priceTimestamp,
          freshness: priceQuality.dataQuality.freshness,
        },
        candles: { count: candleCount },
        corporateAction,
        indicators: {
          present: Boolean(indicatorResponse.indicators),
          asOf: indicatorResponse.indicators?.asOfDate ?? null,
        },
        warnings: [...new Set(warnings)],
        blockers: [...new Set(blockers)],
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        blockers.push('INSTRUMENT_MAPPING_MISSING');
      } else {
        blockers.push('MARKET_DATA_UNAVAILABLE');
      }

      return {
        symbol: normalizedSymbol,
        status: 'BLOCKED',
        mappingStatus: 'MISSING',
        warnings,
        blockers,
      };
    }
  }

  private async resolveUniverse(userId: string, input: MarketDataStatusInput) {
    if (input.symbols?.length) {
      return [
        ...new Set(
          input.symbols
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean),
        ),
      ];
    }

    const latest = await this.prisma.brokerHoldingSnapshot.aggregate({
      where: { userId },
      _max: { asOf: true },
    });

    if (!latest._max.asOf) {
      return [];
    }

    const holdings = await this.prisma.brokerHoldingSnapshot.findMany({
      where: {
        userId,
        asOf: latest._max.asOf,
        assetClass: {
          in: [PortfolioAssetClass.STOCK, PortfolioAssetClass.ETF],
        },
      },
      select: { tradingSymbol: true },
    });

    return [
      ...new Set(
        holdings.map((holding) => holding.tradingSymbol.trim().toUpperCase()),
      ),
    ];
  }
}
