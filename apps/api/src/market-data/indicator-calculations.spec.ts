import {
  calculateIndicators,
  type IndicatorCandle,
} from './indicator-calculations';

describe('calculateIndicators', () => {
  it('calculates SMA, RSI, ATR, volume average, ratio, and SMA distance', () => {
    const candles: IndicatorCandle[] = Array.from(
      { length: 20 },
      (_, index) => {
        const close = index + 1;

        return {
          date: new Date(Date.UTC(2026, 0, index + 1)),
          open: close - 0.5,
          high: close + 2,
          low: close - 1,
          close,
          volume: 101 + index,
        };
      },
    );

    const indicators = calculateIndicators(candles);

    expect(indicators.sma20).toBe(10.5);
    expect(indicators.rsi14).toBe(100);
    expect(indicators.atr14).toBe(3);
    expect(indicators.volumeAverage20).toBe(110.5);
    expect(indicators.volumeRatio).toBe(1.086);
    expect(indicators.distanceFromSma50).toBeNull();
    expect(indicators.warnings).toContain('INSUFFICIENT_CANDLES_FOR_SMA_50');
  });

  it('calculates RSI losses without smoothing for the latest fourteen changes', () => {
    const closes = [
      100, 102, 101, 103, 100, 104, 103, 105, 104, 106, 101, 102, 100, 103, 102,
    ];
    const candles = closes.map((close, index) => ({
      date: new Date(Date.UTC(2026, 1, index + 1)),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000,
    }));

    const indicators = calculateIndicators(candles);

    expect(indicators.rsi14).toBe(53.3333);
  });
});
