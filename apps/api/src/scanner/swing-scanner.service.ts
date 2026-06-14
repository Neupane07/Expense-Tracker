import {
  BadRequestException,
  Injectable,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { PortfolioAssetClass } from '../generated/prisma/client';
import { InstrumentVerificationService } from '../market-data/instrument-verification.service';
import { CandlesService } from '../market-data/candles.service';
import { IndicatorsService } from '../market-data/indicators.service';
import { InstrumentsService } from '../market-data/instruments.service';
import { PricesService } from '../market-data/prices.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExposureService } from '../risk/exposure.service';
import { RiskSettingsService } from '../risk/risk-settings.service';
import type {
  LatestPriceResponse,
  TradeValidationResult,
} from '../risk/trade-validation.service';
import { TradeValidationService } from '../risk/trade-validation.service';
import {
  ResearchSnapshotService,
  type ScannerResearchStatus,
} from '../research/research-snapshot.service';
import type { RunSwingScanInput, SwingSetupType } from './scanner.dto';
import { ScannerReadinessService } from './scanner-readiness.service';
import {
  componentScores,
  scoreSwingConfidence,
} from './swing-confidence.service';
import {
  detectSwingSetups,
  type ScanCandle,
  type ScanIndicators,
} from './swing-setup-detectors';

export type SwingCandidate = {
  symbol: string;
  name: string;
  setupType: SwingSetupType;
  entryZone: { low: number; high: number };
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  suggestedQuantity: number;
  capitalRequired: number;
  maxRiskAmount: number;
  targetProfitAmount: number;
  confidenceScore: number;
  confidenceCapReason: string | null;
  technicalSummary: string;
  fundamentalSummary: string | null;
  newsSummary: string | null;
  portfolioFit: {
    alreadyHeld: boolean;
    exposureBeforePct: number;
    exposureAfterPct: number;
    warnings: string[];
  };
  rejectReasons: string[];
  warnings: string[];
  dataQuality: {
    priceSource: string | null;
    priceTimestamp: string | null;
    technicalSource: string | null;
    freshness: string;
    confidence: string;
    warnings: string[];
  };
  riskValidation: Pick<
    TradeValidationResult,
    'valid' | 'rejectReasons' | 'warnings'
  > | null;
  status: 'candidate' | 'rejected' | 'watchlist';
  suggestedOrderParams: {
    side: 'BUY';
    product: 'DELIVERY';
    quantity: number;
    limitPrice: number;
    targetPrice: number;
    stopLossPrice: number;
    validity: 'DAY';
  } | null;
  researchDisclaimer: string;
  researchFreshness: 'fresh' | 'stale' | 'missing';
  latestResearchAt: string | null;
  researchWarnings: string[];
  evidenceCount: number;
  riskFlags: string[];
};

const RESEARCH_DISCLAIMER =
  'Research only — verify and place manually in Dhan.';

@Injectable()
export class SwingScannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instruments: InstrumentsService,
    private readonly prices: PricesService,
    private readonly candles: CandlesService,
    private readonly indicators: IndicatorsService,
    private readonly tradeValidation: TradeValidationService,
    private readonly exposure: ExposureService,
    private readonly riskSettings: RiskSettingsService,
    private readonly researchSnapshots: ResearchSnapshotService,
    private readonly readiness: ScannerReadinessService,
    private readonly instrumentVerification: InstrumentVerificationService,
  ) {}

  async runScan(
    userId: string,
    input: RunSwingScanInput = {},
    options: { abortSignal?: AbortSignal } = {},
  ) {
    this.assertNotAborted(options.abortSignal);
    const universe = await this.resolveUniverse(userId, input);
    const readiness = await this.readiness.getReadiness(userId, {
      symbols: input.symbols,
    });

    if (readiness.status === 'BLOCKED') {
      throw new BadRequestException({
        message: 'Scanner readiness is blocked for the requested universe.',
        status: readiness.status,
        blockers: readiness.blockers,
        warnings: readiness.warnings,
        universe,
        universeSource: readiness.universeSource,
      });
    }

    const portfolioRisk = await this.exposure.getPortfolioRisk(userId);
    const settings = this.riskSettings.getSettings();
    const scanWarnings: string[] = [];
    const candidates: SwingCandidate[] = [];

    if (universe.length === 0) {
      scanWarnings.push('SCAN_UNIVERSE_EMPTY');
    }

    for (const symbol of universe) {
      this.assertNotAborted(options.abortSignal);
      try {
        const symbolCandidates = await this.scanSymbol(
          userId,
          symbol,
          portfolioRisk.activeSwingTradeCount >= settings.maxActiveSwingTrades,
        );
        candidates.push(...symbolCandidates);
      } catch {
        scanWarnings.push(`SYMBOL_SCAN_FAILED:${symbol}`);
      }
    }

    this.assertNotAborted(options.abortSignal);
    const run = await this.prisma.swingScanRun.create({
      data: {
        userId,
        universeSource: input.symbols?.length ? 'symbols' : 'holdings',
        universe,
        candidateCount: candidates.length,
        candidates: candidates,
        warnings: unique(scanWarnings),
      },
    });

    return {
      runId: run.id,
      runAt: run.runAt,
      universeSource: run.universeSource,
      universe: run.universe,
      candidateCount: run.candidateCount,
      candidates,
      warnings: run.warnings,
      researchDisclaimer: RESEARCH_DISCLAIMER,
    };
  }

  async getLatestCandidates(userId: string) {
    const run = await this.prisma.swingScanRun.findFirst({
      where: { userId },
      orderBy: { runAt: 'desc' },
    });

    if (!run) {
      return {
        run: null,
        candidates: [] as SwingCandidate[],
        researchDisclaimer: RESEARCH_DISCLAIMER,
      };
    }

    return {
      run: {
        id: run.id,
        runAt: run.runAt,
        universeSource: run.universeSource,
        universe: run.universe,
        candidateCount: run.candidateCount,
        warnings: run.warnings,
      },
      candidates: run.candidates as SwingCandidate[],
      researchDisclaimer: RESEARCH_DISCLAIMER,
    };
  }

  private async resolveUniverse(userId: string, input: RunSwingScanInput) {
    if (input.symbols?.length) {
      return unique(
        input.symbols
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean),
      );
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

    return unique(
      holdings.map((holding) => holding.tradingSymbol.trim().toUpperCase()),
    );
  }

  private async scanSymbol(
    userId: string,
    symbol: string,
    maxActiveSwingsReached: boolean,
  ): Promise<SwingCandidate[]> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const rejectReasons: string[] = [];
    const warnings: string[] = [];
    const researchStatus =
      await this.researchSnapshots.getScannerResearchStatus(
        userId,
        normalizedSymbol,
      );

    let instrumentRecord: Awaited<
      ReturnType<InstrumentsService['findBySymbol']>
    >;

    try {
      instrumentRecord = await this.instruments.findBySymbol(
        userId,
        normalizedSymbol,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return [
          this.buildRejectedCandidate({
            symbol: normalizedSymbol,
            name: normalizedSymbol,
            setupType: 'BREAKOUT',
            rejectReasons: ['UNKNOWN_SYMBOL'],
            warnings: [],
            dataQuality: emptyDataQuality(),
            researchStatus,
          }),
        ];
      }

      throw error;
    }

    if (!instrumentRecord.securityId) {
      return [
        this.buildRejectedCandidate({
          symbol: normalizedSymbol,
          name: instrumentRecord.name,
          setupType: 'BREAKOUT',
          rejectReasons: ['SYMBOL_NOT_VERIFIED'],
          warnings: ['SECURITY_ID_MISSING'],
          dataQuality: emptyDataQuality(),
          researchStatus,
        }),
      ];
    }

    const instrument = this.instruments.serialize(instrumentRecord);
    let priceResponse: Awaited<ReturnType<PricesService['getLatest']>>;

    try {
      priceResponse = await this.prices.getLatest(userId, normalizedSymbol);
    } catch {
      return [
        this.buildRejectedCandidate({
          symbol: normalizedSymbol,
          name: instrument.name,
          setupType: 'BREAKOUT',
          rejectReasons: ['PRICE_MISSING'],
          warnings: [],
          dataQuality: emptyDataQuality(),
          researchStatus,
        }),
      ];
    }

    const price = priceResponse.price;
    const freshness = resolvePriceFreshness(
      priceResponse as unknown as PriceResponseShape,
    );

    if (!price?.ltp || freshness === 'MISSING') {
      return [
        this.buildRejectedCandidate({
          symbol: normalizedSymbol,
          name: instrument.name,
          setupType: 'BREAKOUT',
          rejectReasons: ['PRICE_MISSING'],
          warnings: priceResponse.warnings ?? [],
          dataQuality: buildDataQuality(
            priceResponse as unknown as PriceResponseShape,
          ),
          researchStatus,
        }),
      ];
    }

    if (freshness === 'STALE') {
      return [
        this.buildRejectedCandidate({
          symbol: normalizedSymbol,
          name: instrument.name,
          setupType: 'BREAKOUT',
          rejectReasons: ['PRICE_STALE'],
          warnings: priceResponse.warnings ?? [],
          dataQuality: buildDataQuality(
            priceResponse as unknown as PriceResponseShape,
          ),
          researchStatus,
        }),
      ];
    }

    let candleResponse: Awaited<ReturnType<CandlesService['getDailyCandles']>>;

    try {
      candleResponse = await this.candles.getDailyCandles(
        userId,
        normalizedSymbol,
      );
    } catch {
      return [
        this.buildRejectedCandidate({
          symbol: normalizedSymbol,
          name: instrument.name,
          setupType: 'BREAKOUT',
          rejectReasons: ['CANDLES_MISSING'],
          warnings: [],
          dataQuality: buildDataQuality(
            priceResponse as unknown as PriceResponseShape,
          ),
          researchStatus,
        }),
      ];
    }

    if (candleResponse.candles.length === 0) {
      return [
        this.buildRejectedCandidate({
          symbol: normalizedSymbol,
          name: instrument.name,
          setupType: 'BREAKOUT',
          rejectReasons: ['CANDLES_MISSING'],
          warnings: candleResponse.warnings ?? [],
          dataQuality: buildDataQuality(
            priceResponse as unknown as PriceResponseShape,
            candleResponse.source,
          ),
          researchStatus,
        }),
      ];
    }

    const corporateActionPolicy =
      this.instrumentVerification.evaluateCorporateActionPolicy({
        candleCount: candleResponse.candles.length,
        unadjustedCount: candleResponse.candles.filter(
          (candle) => !candle.isAdjusted,
        ).length,
        providerClaimsAdjusted: false,
      });

    if (corporateActionPolicy.blocksHistoricalAnalysis) {
      return [
        this.buildRejectedCandidate({
          symbol: normalizedSymbol,
          name: instrument.name,
          setupType: 'BREAKOUT',
          rejectReasons: [
            'HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT',
            ...corporateActionPolicy.blockers,
          ],
          warnings: corporateActionPolicy.warnings,
          dataQuality: buildDataQuality(
            priceResponse as unknown as PriceResponseShape,
            candleResponse.source,
          ),
          researchStatus,
        }),
      ];
    }

    const indicatorResponse = await this.indicators.getLatest(
      userId,
      normalizedSymbol,
    );
    const scanCandles: ScanCandle[] = candleResponse.candles.map((candle) => ({
      date: new Date(candle.date),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }));
    const scanIndicators: ScanIndicators = {
      sma20: indicatorResponse.indicators.sma20,
      sma50: indicatorResponse.indicators.sma50,
      sma200: indicatorResponse.indicators.sma200,
      rsi14: indicatorResponse.indicators.rsi14,
      atr14: indicatorResponse.indicators.atr14,
      volumeRatio: indicatorResponse.indicators.volumeRatio,
      distanceFromSma50: indicatorResponse.indicators.distanceFromSma50,
    };
    const rawSetups = detectSwingSetups({
      ltp: price.ltp,
      candles: scanCandles,
      indicators: scanIndicators,
    });

    if (rawSetups.length === 0) {
      return [
        this.buildRejectedCandidate({
          symbol: normalizedSymbol,
          name: instrument.name,
          setupType: 'BREAKOUT',
          rejectReasons: ['NO_SETUP_DETECTED'],
          warnings: [],
          dataQuality: buildDataQuality(
            priceResponse as unknown as PriceResponseShape,
            indicatorResponse.source,
          ),
          researchStatus,
        }),
      ];
    }

    const results: SwingCandidate[] = [];
    const isFallbackPrice = isFallbackSource(
      price?.source ?? priceResponse.source,
    );
    const volumeMissing = price.volume == null;

    for (const setup of rawSetups) {
      const riskValidation = await this.tradeValidation.validateTrade(
        userId,
        {
          symbol: normalizedSymbol,
          side: 'BUY',
          entry: setup.entry,
          target: setup.target,
          stopLoss: setup.stopLoss,
          product: 'DELIVERY',
        },
        { marketData: priceResponse as LatestPriceResponse },
      );
      const mergedRejectReasons = unique([
        ...rejectReasons,
        ...riskValidation.rejectReasons,
      ]);
      const mergedWarnings = unique([
        ...warnings,
        ...riskValidation.warnings,
        ...(indicatorResponse.warnings ?? []),
        ...(candleResponse.warnings ?? []),
        ...researchStatus.researchWarnings,
        ...researchStatus.riskFlags,
      ]);

      const scores = componentScores({
        riskReward: riskValidation.riskReward,
        volumeRatio: scanIndicators.volumeRatio,
        distanceFromSma50: scanIndicators.distanceFromSma50,
        setupDetected: true,
        dataFreshness: freshness,
      });
      const confidence = scoreSwingConfidence({
        setupType: setup.setupType,
        riskReward: riskValidation.riskReward,
        technicalScore: scores.technicalScore,
        volumeScore: scores.volumeScore,
        portfolioFitScore: scores.portfolioFitScore,
        dataQualityScore: scores.dataQualityScore,
        rsi14: scanIndicators.rsi14,
        distanceFromSma50: scanIndicators.distanceFromSma50,
        volumeRatio: scanIndicators.volumeRatio,
        isFallbackPrice,
        volumeMissing,
        alreadyHeldHighExposure:
          riskValidation.portfolioExposureAfter.percent > 10,
        marketRegimeRiskOff: false,
        hasFreshNewsOrFiling: researchStatus.hasFreshNewsOrFiling,
        hasStaleResearch: researchStatus.hasStaleResearch,
      });
      const portfolioFitWarnings: string[] = [];

      if (riskValidation.portfolioExposureBefore.percent > 0) {
        portfolioFitWarnings.push('EXISTING_HOLDING');
      }

      if (riskValidation.portfolioExposureAfter.percent > 10) {
        portfolioFitWarnings.push('HIGH_SINGLE_STOCK_EXPOSURE');
      }

      const status = resolveStatus({
        rejectReasons: mergedRejectReasons,
        confidenceScore: confidence.confidenceScore,
        maxActiveSwingsReached,
      });

      results.push({
        symbol: normalizedSymbol,
        name: instrument.name,
        setupType: setup.setupType,
        entryZone: {
          low: roundPrice(setup.entry * 0.995),
          high: roundPrice(setup.entry * 1.005),
        },
        entry: setup.entry,
        target: setup.target,
        stopLoss: setup.stopLoss,
        riskReward: riskValidation.riskReward,
        suggestedQuantity: riskValidation.quantity,
        capitalRequired: riskValidation.capitalRequired,
        maxRiskAmount: riskValidation.maxLossAmount,
        targetProfitAmount: riskValidation.targetProfitAmount,
        confidenceScore: confidence.confidenceScore,
        confidenceCapReason: confidence.confidenceCapReason,
        technicalSummary: setup.technicalSummary,
        fundamentalSummary: null,
        newsSummary: null,
        portfolioFit: {
          alreadyHeld: riskValidation.portfolioExposureBefore.percent > 0,
          exposureBeforePct: riskValidation.portfolioExposureBefore.percent,
          exposureAfterPct: riskValidation.portfolioExposureAfter.percent,
          warnings: portfolioFitWarnings,
        },
        rejectReasons: unique(mergedRejectReasons),
        warnings: mergedWarnings,
        dataQuality: buildDataQuality(
          priceResponse as unknown as PriceResponseShape,
          indicatorResponse.source,
        ),
        riskValidation: {
          valid: riskValidation.valid,
          rejectReasons: riskValidation.rejectReasons,
          warnings: riskValidation.warnings,
        },
        status,
        suggestedOrderParams:
          status === 'candidate'
            ? {
                side: 'BUY',
                product: 'DELIVERY',
                quantity: riskValidation.quantity,
                limitPrice: setup.entry,
                targetPrice: setup.target,
                stopLossPrice: setup.stopLoss,
                validity: 'DAY',
              }
            : null,
        researchDisclaimer: RESEARCH_DISCLAIMER,
        researchFreshness: researchStatus.researchFreshness,
        latestResearchAt: researchStatus.latestResearchAt,
        researchWarnings: researchStatus.researchWarnings,
        evidenceCount: researchStatus.evidenceCount,
        riskFlags: researchStatus.riskFlags,
      });
    }

    return results;
  }

  private buildRejectedCandidate(input: {
    symbol: string;
    name: string;
    setupType: SwingSetupType;
    rejectReasons: string[];
    warnings: string[];
    dataQuality: SwingCandidate['dataQuality'];
    researchStatus: ScannerResearchStatus;
  }): SwingCandidate {
    const mergedWarnings = unique([
      ...input.warnings,
      ...input.researchStatus.researchWarnings,
      ...input.researchStatus.riskFlags,
    ]);

    return {
      symbol: input.symbol,
      name: input.name,
      setupType: input.setupType,
      entryZone: { low: 0, high: 0 },
      entry: 0,
      target: 0,
      stopLoss: 0,
      riskReward: 0,
      suggestedQuantity: 0,
      capitalRequired: 0,
      maxRiskAmount: 0,
      targetProfitAmount: 0,
      confidenceScore: 0,
      confidenceCapReason: null,
      technicalSummary: 'Setup rejected before full evaluation.',
      fundamentalSummary: null,
      newsSummary: null,
      portfolioFit: {
        alreadyHeld: false,
        exposureBeforePct: 0,
        exposureAfterPct: 0,
        warnings: [],
      },
      rejectReasons: unique(input.rejectReasons),
      warnings: mergedWarnings,
      dataQuality: input.dataQuality,
      riskValidation: null,
      status: 'rejected',
      suggestedOrderParams: null,
      researchDisclaimer: RESEARCH_DISCLAIMER,
      researchFreshness: input.researchStatus.researchFreshness,
      latestResearchAt: input.researchStatus.latestResearchAt,
      researchWarnings: input.researchStatus.researchWarnings,
      evidenceCount: input.researchStatus.evidenceCount,
      riskFlags: input.researchStatus.riskFlags,
    };
  }

  private assertNotAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
      throw new RequestTimeoutException('SCAN_ABORTED_TIMEOUT');
    }
  }
}

function resolveStatus(input: {
  rejectReasons: string[];
  confidenceScore: number;
  maxActiveSwingsReached: boolean;
}): SwingCandidate['status'] {
  if (input.rejectReasons.length > 0) {
    return 'rejected';
  }

  if (input.maxActiveSwingsReached || input.confidenceScore < 6) {
    return 'watchlist';
  }

  return 'candidate';
}

type DataQualityLabel = {
  freshness?: string;
  confidence?: string;
};

type PriceResponseShape = {
  price?: {
    source?: string;
    timestamp?: Date | string | null;
    freshness?: string;
    dataQuality?: DataQualityLabel;
  } | null;
  source?: string;
  dataQuality?: DataQualityLabel;
  warnings?: string[];
};

function readDataQuality(
  value: DataQualityLabel | undefined,
): DataQualityLabel | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return value;
}

function resolvePriceFreshness(priceResponse: PriceResponseShape) {
  const responseQuality = readDataQuality(priceResponse.dataQuality);
  const priceQuality = readDataQuality(priceResponse.price?.dataQuality);

  return (
    responseQuality?.freshness ??
    priceQuality?.freshness ??
    priceResponse.price?.freshness ??
    'MISSING'
  );
}

function buildDataQuality(
  priceResponse: PriceResponseShape,
  technicalSource?: string,
): SwingCandidate['dataQuality'] {
  const freshness = resolvePriceFreshness(priceResponse);

  return {
    priceSource: priceResponse.price?.source ?? priceResponse.source ?? null,
    priceTimestamp: priceResponse.price?.timestamp
      ? new Date(priceResponse.price.timestamp).toISOString()
      : null,
    technicalSource: technicalSource ?? null,
    freshness,
    confidence: priceResponse.dataQuality?.confidence ?? 'LOW',
    warnings: priceResponse.warnings ?? [],
  };
}

function emptyDataQuality(): SwingCandidate['dataQuality'] {
  return {
    priceSource: null,
    priceTimestamp: null,
    technicalSource: null,
    freshness: 'MISSING',
    confidence: 'LOW',
    warnings: [],
  };
}

function isFallbackSource(source: string | null | undefined) {
  const normalized = source?.toUpperCase() ?? '';

  return (
    normalized.includes('FALLBACK') ||
    normalized.includes('UNOFFICIAL') ||
    normalized.includes('YAHOO') ||
    normalized.includes('MANUAL')
  );
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function roundPrice(value: number) {
  return Math.round(value * 10000) / 10000;
}
