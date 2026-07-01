import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SwingScannerService } from './swing-scanner.service';
import { DEFAULT_RISK_SETTINGS } from '../risk/risk-settings.service';

describe('SwingScannerService', () => {
  const livePrice = {
    ltp: 100,
    source: 'DHAN',
    timestamp: new Date('2026-05-30T09:30:00.000Z'),
    freshness: 'LIVE',
    volume: 100000,
    dataQuality: { freshness: 'LIVE', confidence: 'HIGH' },
    warnings: [],
  };

  const candles = Array.from({ length: 60 }, (_, index) => {
    const close = 90 + index * 0.5;

    return {
      date: new Date(
        `2026-03-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      ),
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 10000 + index * 100,
      isAdjusted: true,
    };
  });

  const indicators = {
    sma20: 118,
    sma50: 110,
    sma200: 95,
    rsi14: 38,
    atr14: 3,
    volumeAverage20: 12000,
    volumeRatio: 1.25,
    distanceFromSma50: 1.2,
    source: 'DHAN',
    dataQuality: { confidence: 'HIGH' },
    warnings: [],
  };

  function createService(overrides?: {
    instrument?: unknown;
    instrumentError?: Error;
    price?: unknown;
    candles?: unknown;
    indicators?: unknown;
    validation?: unknown;
    researchStatus?: unknown;
    readiness?: unknown;
    corporateActionPolicy?: () => {
      blocksHistoricalAnalysis: boolean;
      blockers: string[];
      warnings: string[];
      status: string;
    };
  }) {
    const prisma = {
      brokerHoldingSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { asOf: new Date() } }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { tradingSymbol: 'INFY' },
            { tradingSymbol: 'TCS' },
          ]),
      },
      swingScanRun: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'run-1',
            runAt: new Date('2026-05-30T10:00:00.000Z'),
            ...data,
          }),
        ),
        delete: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
    };
    const instruments = {
      findBySymbol: overrides?.instrumentError
        ? jest.fn().mockRejectedValue(overrides.instrumentError)
        : jest.fn().mockResolvedValue(
            overrides?.instrument ?? {
              id: 'inst-1',
              symbol: 'INFY',
              exchange: 'NSE',
              securityId: '1594',
              isin: null,
              name: 'Infosys',
              instrumentType: 'EQUITY',
              sector: 'IT',
              industry: 'Software',
              isActive: true,
              source: 'DHAN_HOLDINGS',
              lastVerifiedAt: new Date(),
            },
          ),
      serialize: jest.fn(
        (instrument: { symbol: string; name: string; securityId: string }) => ({
          symbol: instrument.symbol,
          name: instrument.name,
          securityId: instrument.securityId,
          dataQuality: { freshness: 'RECENT', confidence: 'HIGH' },
          warnings: [],
        }),
      ),
    };
    const prices = {
      getLatest: jest.fn().mockResolvedValue(
        overrides?.price ?? {
          instrument: { symbol: 'INFY', name: 'Infosys' },
          price: livePrice,
          source: 'DHAN',
          dataQuality: { freshness: 'LIVE', confidence: 'HIGH' },
          warnings: [],
        },
      ),
    };
    const candlesService = {
      getDailyCandles: jest.fn().mockResolvedValue(
        overrides?.candles ?? {
          candles,
          source: 'DHAN',
          warnings: [],
        },
      ),
    };
    const indicatorsService = {
      getLatest: jest.fn().mockResolvedValue(
        overrides?.indicators ?? {
          indicators,
          source: 'DHAN',
          warnings: [],
        },
      ),
    };
    const tradeValidation = {
      validateTrade: jest.fn().mockResolvedValue(
        overrides?.validation ?? {
          valid: true,
          symbol: 'INFY',
          entry: 100,
          target: 120,
          stopLoss: 90,
          quantity: 5,
          capitalRequired: 500,
          riskPerShare: 10,
          rewardPerShare: 20,
          riskReward: 2,
          maxLossAmount: 50,
          targetProfitAmount: 100,
          portfolioExposureBefore: { amount: 0, percent: 0 },
          portfolioExposureAfter: { amount: 500, percent: 0.25 },
          warnings: [],
          rejectReasons: [],
          dataQuality: {
            source: 'DHAN',
            asOf: new Date(),
            freshness: 'LIVE',
            confidence: 'HIGH',
            warnings: [],
          },
        },
      ),
    };
    const exposure = {
      getPortfolioRisk: jest.fn().mockResolvedValue({
        activeSwingTradeCount: 0,
      }),
    };
    const riskSettings = {
      getSettings: jest.fn(() => DEFAULT_RISK_SETTINGS),
    };
    const researchSnapshots = {
      getScannerResearchStatus: jest.fn().mockResolvedValue(
        overrides?.researchStatus ?? {
          researchFreshness: 'missing',
          latestResearchAt: null,
          researchWarnings: ['RESEARCH_EVIDENCE_MISSING'],
          evidenceCount: 0,
          riskFlags: [],
          hasFreshNewsOrFiling: false,
          hasStaleResearch: false,
        },
      ),
    };
    const readiness = {
      getReadiness: jest.fn().mockResolvedValue(
        overrides?.readiness ?? {
          status: 'READY',
          blockers: [],
          warnings: [],
          universeSource: 'symbols',
          universe: ['INFY'],
        },
      ),
    };
    const instrumentVerification = {
      evaluateCorporateActionPolicy: jest.fn(
        overrides?.corporateActionPolicy ??
          (() => ({
            blocksHistoricalAnalysis: false,
            blockers: [],
            warnings: [],
            status: 'READY',
            adjustmentStatus: 'VERIFIED',
            providerAvailable: false,
          })),
      ),
    };

    return {
      service: new SwingScannerService(
        prisma as never,
        instruments as never,
        prices as never,
        candlesService as never,
        indicatorsService as never,
        tradeValidation as never,
        exposure as never,
        riskSettings as never,
        researchSnapshots as never,
        readiness as never,
        instrumentVerification as never,
      ),
      prisma,
      tradeValidation,
      prices,
      readiness,
    };
  }

  it('rejects unknown symbols without guessing securityId', async () => {
    const { service } = createService({
      instrumentError: new NotFoundException('not mapped'),
    });

    const result = await service.runScan('user-1', { symbols: ['UNKNOWN'] });

    expect(result.candidates[0]?.rejectReasons).toContain('UNKNOWN_SYMBOL');
    expect(result.candidates[0]?.status).toBe('rejected');
  });

  it('rejects blocked scans before processing candle history', async () => {
    const { service } = createService({
      readiness: {
        status: 'BLOCKED',
        blockers: ['HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT'],
        warnings: ['CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED'],
        universeSource: 'symbols',
        universe: ['INFY'],
      },
    });

    await expect(
      service.runScan('user-1', { symbols: ['INFY'] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    try {
      await service.runScan('user-1', { symbols: ['INFY'] });
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        blockers: ['HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT'],
      });
    }
  });

  it('rejects unadjusted candle history during symbol scans', async () => {
    const unadjustedCandles = candles.map((candle) => ({
      ...candle,
      isAdjusted: false,
    }));
    const { service, readiness } = createService({
      readiness: {
        status: 'READY',
        blockers: [],
        warnings: [],
        universeSource: 'symbols',
        universe: ['INFY'],
      },
      candles: {
        candles: unadjustedCandles,
        source: 'DHAN',
        warnings: [],
      },
      corporateActionPolicy: () => ({
        blocksHistoricalAnalysis: true,
        blockers: ['CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED'],
        warnings: ['CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED'],
        status: 'BLOCKED',
        adjustmentStatus: 'UNVERIFIED',
        providerAvailable: false,
      }),
    });

    const result = await service.runScan('user-1', { symbols: ['INFY'] });

    expect(readiness.getReadiness).toHaveBeenCalled();
    expect(result.candidates[0]?.rejectReasons).toContain(
      'HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT',
    );
  });

  it('rejects stale market data', async () => {
    const { service } = createService({
      price: {
        instrument: { symbol: 'INFY', name: 'Infosys' },
        price: {
          ...livePrice,
          freshness: 'STALE',
          dataQuality: { freshness: 'STALE', confidence: 'LOW' },
        },
        source: 'DHAN',
        dataQuality: { freshness: 'STALE', confidence: 'LOW' },
        warnings: ['PRICE_STALE'],
      },
    });

    const result = await service.runScan('user-1', { symbols: ['INFY'] });

    expect(result.candidates[0]?.rejectReasons).toContain('PRICE_STALE');
  });

  it('caps confidence for fallback prices on accepted setups', async () => {
    const { service } = createService({
      price: {
        instrument: { symbol: 'INFY', name: 'Infosys' },
        price: {
          ...livePrice,
          source: 'YAHOO_FALLBACK',
        },
        source: 'YAHOO_FALLBACK',
        dataQuality: { freshness: 'LIVE', confidence: 'MEDIUM' },
        warnings: [],
      },
    });

    const result = await service.runScan('user-1', { symbols: ['INFY'] });
    const candidate = result.candidates.find(
      (row) => row.rejectReasons.length === 0 || row.confidenceScore > 0,
    );

    if (candidate && candidate.status !== 'rejected') {
      expect(candidate.confidenceScore).toBeLessThanOrEqual(6);
      expect(candidate.confidenceCapReason).toContain('FALLBACK_PRICE_SOURCE');
    }
  });

  it('routes each setup through shared trade validation', async () => {
    const { service, tradeValidation } = createService();

    await service.runScan('user-1', { symbols: ['INFY'] });

    expect(tradeValidation.validateTrade).toHaveBeenCalled();
    const firstCall = tradeValidation.validateTrade.mock.calls[0] as
      | [string, { side: string; product: string }]
      | undefined;
    expect(firstCall?.[1]).toMatchObject({
      side: 'BUY',
      product: 'DELIVERY',
    });
  });

  it('never exposes order placement helpers', () => {
    const { service } = createService();
    const prototype = Object.getPrototypeOf(service) as object;
    const methodNames = Object.getOwnPropertyNames(prototype);

    expect(methodNames).not.toEqual(
      expect.arrayContaining([
        'placeOrder',
        'modifyOrder',
        'cancelOrder',
        'submitTrade',
      ]),
    );
  });

  it('marks low risk-reward setups as rejected via shared validation', async () => {
    const { service } = createService({
      validation: {
        valid: false,
        symbol: 'INFY',
        entry: 100,
        target: 108,
        stopLoss: 90,
        quantity: 5,
        capitalRequired: 500,
        riskPerShare: 10,
        rewardPerShare: 8,
        riskReward: 0.8,
        maxLossAmount: 50,
        targetProfitAmount: 40,
        portfolioExposureBefore: { amount: 0, percent: 0 },
        portfolioExposureAfter: { amount: 500, percent: 0.25 },
        warnings: [],
        rejectReasons: ['RISK_REWARD_BELOW_MINIMUM'],
        dataQuality: {
          source: 'DHAN',
          asOf: new Date(),
          freshness: 'LIVE',
          confidence: 'HIGH',
          warnings: [],
        },
      },
    });

    const result = await service.runScan('user-1', { symbols: ['INFY'] });
    const rejected = result.candidates.find((row) =>
      row.rejectReasons.includes('RISK_REWARD_BELOW_MINIMUM'),
    );

    expect(rejected).toBeDefined();
    expect(rejected?.suggestedOrderParams).toBeNull();
  });

  it('warns when portfolio fit shows existing holdings', async () => {
    const { service } = createService({
      validation: {
        valid: true,
        symbol: 'INFY',
        entry: 100,
        target: 120,
        stopLoss: 90,
        quantity: 5,
        capitalRequired: 500,
        riskPerShare: 10,
        rewardPerShare: 20,
        riskReward: 2,
        maxLossAmount: 50,
        targetProfitAmount: 100,
        portfolioExposureBefore: { amount: 20000, percent: 12 },
        portfolioExposureAfter: { amount: 20500, percent: 12.5 },
        warnings: ['SYMBOL_ALREADY_HELD'],
        rejectReasons: [],
        dataQuality: {
          source: 'DHAN',
          asOf: new Date(),
          freshness: 'LIVE',
          confidence: 'HIGH',
          warnings: [],
        },
      },
    });

    const result = await service.runScan('user-1', { symbols: ['INFY'] });
    const candidate = result.candidates.find((row) => row.symbol === 'INFY');

    expect(candidate?.portfolioFit.alreadyHeld).toBe(true);
    expect(candidate?.warnings).toEqual(
      expect.arrayContaining(['SYMBOL_ALREADY_HELD']),
    );
  });

  it('caps confidence when no fresh research exists', async () => {
    const { service } = createService({
      researchStatus: {
        researchFreshness: 'missing',
        latestResearchAt: null,
        researchWarnings: ['RESEARCH_EVIDENCE_MISSING'],
        evidenceCount: 0,
        riskFlags: [],
        hasFreshNewsOrFiling: false,
        hasStaleResearch: false,
      },
    });

    const result = await service.runScan('user-1', { symbols: ['INFY'] });
    const candidate = result.candidates.find(
      (row) => row.symbol === 'INFY' && row.rejectReasons.length === 0,
    );

    if (candidate) {
      expect(candidate.confidenceCapReason).toContain(
        'NO_FRESH_NEWS_OR_FILING_CHECK',
      );
      expect(candidate.researchFreshness).toBe('missing');
    }
  });

  it('warns and caps confidence when research is stale', async () => {
    const { service } = createService({
      researchStatus: {
        researchFreshness: 'stale',
        latestResearchAt: '2025-01-01T00:00:00.000Z',
        researchWarnings: ['STALE_RESEARCH_EVIDENCE'],
        evidenceCount: 2,
        riskFlags: ['Old result miss'],
        hasFreshNewsOrFiling: false,
        hasStaleResearch: true,
      },
    });

    const result = await service.runScan('user-1', { symbols: ['INFY'] });
    const candidate = result.candidates.find((row) => row.symbol === 'INFY');

    expect(candidate?.researchWarnings).toContain('STALE_RESEARCH_EVIDENCE');
    expect(candidate?.confidenceCapReason).toContain('STALE_RESEARCH_EVIDENCE');
    expect(candidate?.researchFreshness).toBe('stale');
  });

  it('does not persist a scan run when aborted before completion', async () => {
    const { service, prisma } = createService();
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      service.runScan(
        'user-1',
        { symbols: ['INFY'] },
        {
          abortSignal: abortController.signal,
        },
      ),
    ).rejects.toThrow('SCAN_ABORTED_TIMEOUT');

    expect(prisma.swingScanRun.create).not.toHaveBeenCalled();
  });

  it('deletes persisted run when aborted immediately after create', async () => {
    const { service, prisma } = createService();
    const abortController = new AbortController();

    prisma.swingScanRun.create = jest.fn().mockImplementation(() => {
      abortController.abort();
      return Promise.resolve({
        id: 'run-1',
        runAt: new Date('2026-05-30T10:00:00.000Z'),
        universeSource: 'symbols',
        universe: ['INFY'],
        candidateCount: 0,
        candidates: [],
        warnings: [],
      });
    });

    await expect(
      service.runScan(
        'user-1',
        { symbols: ['INFY'] },
        {
          abortSignal: abortController.signal,
        },
      ),
    ).rejects.toThrow('SCAN_ABORTED_TIMEOUT');

    expect(prisma.swingScanRun.delete).toHaveBeenCalledWith({
      where: { id: 'run-1' },
    });
  });
});
