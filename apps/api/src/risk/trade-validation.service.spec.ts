import { NotFoundException } from '@nestjs/common';
import { TradeValidationService } from './trade-validation.service';
import { DEFAULT_RISK_SETTINGS } from './risk-settings.service';

describe('TradeValidationService', () => {
  const liveMarketData = {
    instrument: {
      symbol: 'INFY',
      isActive: true,
      securityId: '1594',
      instrumentType: 'EQUITY',
      source: 'DHAN',
    },
    price: {
      ltp: 100,
      source: 'DHAN',
      timestamp: new Date('2026-05-30T09:30:00.000Z'),
      freshness: 'LIVE',
      dataQuality: {
        freshness: 'LIVE',
        confidence: 'HIGH',
      },
      warnings: [],
    },
    source: 'DHAN',
    dataQuality: {
      freshness: 'LIVE',
      confidence: 'HIGH',
    },
    warnings: [],
  };
  const portfolio = {
    totalPortfolioValue: 200000,
    cash: 100000,
    activeSwingCapital: 0,
    activeSwingTradeCount: 0,
  };

  function createService(overrides?: {
    marketData?: unknown;
    tradeExposure?: unknown;
  }) {
    const prices = {
      getLatest: jest
        .fn()
        .mockResolvedValue(overrides?.marketData ?? liveMarketData),
    };
    const exposure = {
      getPortfolioRisk: jest.fn().mockResolvedValue(portfolio),
      getTradeExposure: jest.fn().mockResolvedValue(
        overrides?.tradeExposure ?? {
          symbol: 'INFY',
          alreadyHeld: false,
          existingMarketValue: 0,
          totalPortfolioValue: 200000,
          beforeAmount: 0,
          beforePct: 0,
          afterAmount: 1000,
          afterPct: 0.5,
          concentrationIncreasePct: 0.5,
        },
      ),
    };
    const positionSizing = {
      calculate: jest.fn().mockReturnValue({ quantity: 10 }),
    };
    const settings = {
      getSettings: jest.fn(() => DEFAULT_RISK_SETTINGS),
    };

    return {
      service: new TradeValidationService(
        prices as never,
        exposure as never,
        positionSizing as never,
        settings as never,
      ),
      prices,
      exposure,
    };
  }

  const validInput = {
    symbol: 'INFY',
    side: 'BUY',
    entry: 100,
    target: 120,
    stopLoss: 90,
    quantity: 10,
    product: 'DELIVERY',
  };

  it('returns valid trade calculation details', async () => {
    const { service } = createService();

    const result = await service.validateTrade('user-1', validInput);

    expect(result.valid).toBe(true);
    expect(result).toMatchObject({
      symbol: 'INFY',
      entry: 100,
      target: 120,
      stopLoss: 90,
      quantity: 10,
      capitalRequired: 1000,
      riskPerShare: 10,
      rewardPerShare: 20,
      riskReward: 2,
      maxLossAmount: 100,
      targetProfitAmount: 200,
      rejectReasons: [],
    });
  });

  it('rejects risk reward below the configured minimum', async () => {
    const { service } = createService();

    const result = await service.validateTrade('user-1', {
      ...validInput,
      target: 115,
    });

    expect(result.valid).toBe(false);
    expect(result.rejectReasons).toContain('RISK_REWARD_BELOW_MINIMUM');
  });

  it('rejects stop loss above entry for BUY', async () => {
    const { service } = createService();

    const result = await service.validateTrade('user-1', {
      ...validInput,
      stopLoss: 101,
    });

    expect(result.valid).toBe(false);
    expect(result.rejectReasons).toContain(
      'STOP_LOSS_MUST_BE_BELOW_ENTRY_FOR_BUY',
    );
  });

  it('rejects target below entry for BUY', async () => {
    const { service } = createService();

    const result = await service.validateTrade('user-1', {
      ...validInput,
      target: 99,
    });

    expect(result.valid).toBe(false);
    expect(result.rejectReasons).toContain(
      'TARGET_MUST_BE_ABOVE_ENTRY_FOR_BUY',
    );
  });

  it('rejects stale market data', async () => {
    const { service } = createService({
      marketData: {
        ...liveMarketData,
        price: {
          ...liveMarketData.price,
          dataQuality: {
            freshness: 'STALE',
            confidence: 'LOW',
          },
          warnings: ['PRICE_STALE'],
        },
      },
    });

    const result = await service.validateTrade('user-1', validInput);

    expect(result.valid).toBe(false);
    expect(result.rejectReasons).toContain('PRICE_STALE');
    expect(result.dataQuality.warnings).toContain('PRICE_STALE');
  });

  it('warns when the symbol is already held', async () => {
    const { service } = createService({
      tradeExposure: {
        symbol: 'INFY',
        alreadyHeld: true,
        existingMarketValue: 10000,
        totalPortfolioValue: 200000,
        beforeAmount: 10000,
        beforePct: 5,
        afterAmount: 11000,
        afterPct: 5.5,
        concentrationIncreasePct: 0.5,
      },
    });

    const result = await service.validateTrade('user-1', validInput);

    expect(result.valid).toBe(true);
    expect(result.warnings).toContain('SYMBOL_ALREADY_HELD');
    expect(result.warnings).toContain('TRADE_INCREASES_CONCENTRATION');
  });

  it('rejects product values other than DELIVERY', async () => {
    const { service } = createService();

    const result = await service.validateTrade('user-1', {
      ...validInput,
      product: 'INTRADAY',
    });

    expect(result.valid).toBe(false);
    expect(result.rejectReasons).toContain('PRODUCT_NOT_DELIVERY');
  });

  it('rejects missing symbols', async () => {
    const { service, prices } = createService();
    prices.getLatest.mockRejectedValueOnce(
      new NotFoundException('Instrument MISSING is not mapped yet.'),
    );

    const result = await service.validateTrade('user-1', {
      ...validInput,
      symbol: 'MISSING',
    });

    expect(result.valid).toBe(false);
    expect(result.rejectReasons).toContain('UNKNOWN_SYMBOL');
    expect(result.rejectReasons).toContain('PRICE_MISSING');
  });
});
