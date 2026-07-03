import { BadRequestException } from '@nestjs/common';
import { IndicatorsService } from './indicators.service';
import {
  DHAN_CANDLE_ADJUSTMENT_POLICY,
  DHAN_MARKET_DATA_SOURCE,
} from './corporate-action.constants';

describe('IndicatorsService', () => {
  it('rehydrates candles through CandlesService before enforcing corporate-action policy', async () => {
    const evaluateForInstrument = jest.fn().mockResolvedValue({
      blocksHistoricalAnalysis: false,
      blockers: [],
    });
    const getCandlesForIndicators = jest.fn().mockResolvedValue({
      source: DHAN_MARKET_DATA_SOURCE,
      candles: [
        {
          date: new Date('2026-05-15'),
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
          source: DHAN_MARKET_DATA_SOURCE,
          isAdjusted: true,
          adjustmentPolicy: DHAN_CANDLE_ADJUSTMENT_POLICY,
        },
      ],
    });
    const decimal = (value: number) => ({ toNumber: () => value });
    const upsert = jest.fn().mockResolvedValue({
      id: 'snapshot-1',
      asOfDate: new Date('2026-05-15'),
      sma20: decimal(100),
      sma50: decimal(99),
      sma200: decimal(95),
      rsi14: decimal(50),
      atr14: decimal(2),
      volumeAverage20: decimal(1000),
      volumeRatio: decimal(1),
      distanceFromSma50: decimal(1),
      source: DHAN_MARKET_DATA_SOURCE,
      dataQuality: { confidence: 'HIGH' },
      warnings: [],
    });

    const service = new IndicatorsService(
      {
        technicalIndicatorSnapshot: { upsert },
      } as never,
      {
        findBySymbol: jest.fn().mockResolvedValue({
          id: 'inst-1',
          symbol: 'INFY',
          exchange: 'NSE',
        }),
        serialize: jest.fn().mockReturnValue({ symbol: 'INFY' }),
      } as never,
      { getCandlesForIndicators } as never,
      { evaluateForInstrument } as never,
    );

    await service.recalculate('user-1', 'INFY');

    expect(getCandlesForIndicators).toHaveBeenCalledTimes(1);
    expect(evaluateForInstrument).toHaveBeenCalledTimes(1);
    expect(getCandlesForIndicators.mock.invocationCallOrder[0]).toBeLessThan(
      evaluateForInstrument.mock.invocationCallOrder[0],
    );
    expect(upsert).toHaveBeenCalled();
  });

  it('rejects recalculation when policy remains blocked after rehydration', async () => {
    const service = new IndicatorsService(
      { technicalIndicatorSnapshot: { upsert: jest.fn() } } as never,
      {
        findBySymbol: jest.fn().mockResolvedValue({
          id: 'inst-1',
          symbol: 'INFY',
          exchange: 'NSE',
        }),
        serialize: jest.fn(),
      } as never,
      {
        getCandlesForIndicators: jest.fn().mockResolvedValue({
          source: DHAN_MARKET_DATA_SOURCE,
          candles: [],
        }),
      } as never,
      {
        evaluateForInstrument: jest.fn().mockResolvedValue({
          blocksHistoricalAnalysis: true,
          blockers: ['CORPORATE_ACTION_REHYDRATION_REQUIRED'],
        }),
      } as never,
    );

    await expect(service.recalculate('user-1', 'INFY')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
