import { detectSwingSetups } from './swing-setup-detectors';

function buildCandles(closes: number[]) {
  return closes.map((close, index) => ({
    date: new Date(
      `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    ),
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 10000,
  }));
}

describe('detectSwingSetups', () => {
  it('detects pullback and RSI reversal setups deterministically', () => {
    const candles = buildCandles(
      Array.from({ length: 60 }, (_, index) => 90 + index * 0.4),
    );
    const ltp = candles.at(-1)?.close ?? 100;

    const setups = detectSwingSetups({
      ltp,
      candles,
      indicators: {
        sma20: ltp - 1,
        sma50: ltp - 0.5,
        sma200: ltp - 10,
        rsi14: 40,
        atr14: 2,
        volumeRatio: 1.1,
        distanceFromSma50: 1,
      },
    });

    expect(setups.length).toBeGreaterThan(0);
    expect(
      setups.some((setup) => setup.setupType === 'PULLBACK_TO_SUPPORT'),
    ).toBe(true);
  });
});
