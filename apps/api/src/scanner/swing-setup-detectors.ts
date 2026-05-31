import type { SwingSetupType } from './scanner.dto';

export type ScanCandle = {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type ScanIndicators = {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  atr14: number | null;
  volumeRatio: number | null;
  distanceFromSma50: number | null;
};

export type RawSwingSetup = {
  setupType: SwingSetupType;
  entry: number;
  target: number;
  stopLoss: number;
  technicalSummary: string;
};

export type ScanMarketContext = {
  ltp: number;
  candles: ScanCandle[];
  indicators: ScanIndicators;
};

export function detectSwingSetups(context: ScanMarketContext): RawSwingSetup[] {
  const setups: RawSwingSetup[] = [];
  const breakout = detectBreakout(context);

  if (breakout) {
    setups.push(breakout);
  }

  const pullback = detectPullbackToSupport(context);

  if (pullback) {
    setups.push(pullback);
  }

  const rsiReversal = detectRsiReversal(context);

  if (rsiReversal) {
    setups.push(rsiReversal);
  }

  return setups;
}

function detectBreakout(context: ScanMarketContext): RawSwingSetup | null {
  const { ltp, indicators, candles } = context;

  if (indicators.sma20 == null || indicators.sma50 == null) {
    return null;
  }

  const recentHigh = Math.max(
    ...candles.slice(-20).map((candle) => candle.high),
  );
  const nearBreakout = ltp >= recentHigh * 0.985 && ltp > indicators.sma20;
  const trendAligned = ltp > indicators.sma50;
  const volumeConfirmed =
    indicators.volumeRatio == null || indicators.volumeRatio >= 1.1;

  if (!nearBreakout || !trendAligned || !volumeConfirmed) {
    return null;
  }

  const stopLoss = Math.min(
    stopFromAtr(ltp, indicators.atr14, 1.5),
    recentSwingLow(candles, 10) * 0.995,
  );
  const risk = ltp - stopLoss;

  if (risk <= 0) {
    return null;
  }

  const target = roundPrice(ltp + Math.max(risk * 2, risk * 1.8));

  return {
    setupType: 'BREAKOUT',
    entry: roundPrice(ltp),
    target,
    stopLoss: roundPrice(stopLoss),
    technicalSummary:
      'Price is pressing recent highs above SMA 20/50 with acceptable volume confirmation.',
  };
}

function detectPullbackToSupport(
  context: ScanMarketContext,
): RawSwingSetup | null {
  const { ltp, indicators } = context;

  if (
    indicators.sma50 == null ||
    indicators.rsi14 == null ||
    indicators.distanceFromSma50 == null
  ) {
    return null;
  }

  const nearSupport =
    indicators.distanceFromSma50 >= -3 && indicators.distanceFromSma50 <= 2.5;
  const rsiHealthy = indicators.rsi14 >= 35 && indicators.rsi14 <= 58;
  const aboveLongTrend =
    indicators.sma200 == null || ltp >= indicators.sma200 * 0.98;

  if (!nearSupport || !rsiHealthy || !aboveLongTrend) {
    return null;
  }

  const stopLoss = Math.min(
    stopFromAtr(ltp, indicators.atr14, 1.5),
    indicators.sma50 * 0.97,
  );
  const risk = ltp - stopLoss;

  if (risk <= 0) {
    return null;
  }

  return {
    setupType: 'PULLBACK_TO_SUPPORT',
    entry: roundPrice(ltp),
    target: roundPrice(ltp + risk * 2.2),
    stopLoss: roundPrice(stopLoss),
    technicalSummary:
      'Price is pulling back toward SMA 50 support with RSI recovering in an uptrend.',
  };
}

function detectRsiReversal(context: ScanMarketContext): RawSwingSetup | null {
  const { ltp, indicators, candles } = context;

  if (indicators.rsi14 == null) {
    return null;
  }

  const recovering = indicators.rsi14 >= 32 && indicators.rsi14 <= 45;
  const notOverbought = indicators.rsi14 < 55;

  if (!recovering || !notOverbought) {
    return null;
  }

  const stopLoss = Math.min(
    stopFromAtr(ltp, indicators.atr14, 1.5),
    recentSwingLow(candles, 15) * 0.99,
  );
  const risk = ltp - stopLoss;

  if (risk <= 0) {
    return null;
  }

  return {
    setupType: 'RSI_REVERSAL',
    entry: roundPrice(ltp),
    target: roundPrice(ltp + risk * 2),
    stopLoss: roundPrice(stopLoss),
    technicalSummary:
      'RSI is recovering from oversold territory while price holds above recent swing lows.',
  };
}

function stopFromAtr(entry: number, atr: number | null, multiplier: number) {
  if (atr != null && atr > 0) {
    return entry - atr * multiplier;
  }

  return entry * 0.97;
}

function recentSwingLow(candles: ScanCandle[], lookback: number) {
  const slice = candles.slice(-lookback);

  if (slice.length === 0) {
    return 0;
  }

  return Math.min(...slice.map((candle) => candle.low));
}

function roundPrice(value: number) {
  return Math.round(value * 10000) / 10000;
}
