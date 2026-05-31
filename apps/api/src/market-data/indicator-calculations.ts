export type IndicatorCandle = {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type IndicatorValues = {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  atr14: number | null;
  volumeAverage20: number | null;
  volumeRatio: number | null;
  distanceFromSma50: number | null;
  warnings: string[];
};

export function calculateIndicators(
  candles: IndicatorCandle[],
): IndicatorValues {
  const sorted = [...candles].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const warnings: string[] = [];
  const sma20 = calculateSma(sorted, 20);
  const sma50 = calculateSma(sorted, 50);
  const sma200 = calculateSma(sorted, 200);
  const rsi14 = calculateRsi(sorted, 14);
  const atr14 = calculateAtr(sorted, 14);
  const volumeAverage20 = calculateVolumeAverage(sorted, 20);
  const latest = sorted.at(-1);
  const volumeRatio =
    latest?.volume != null && volumeAverage20 && volumeAverage20 > 0
      ? round(latest.volume / volumeAverage20, 4)
      : null;
  const distanceFromSma50 =
    latest && sma50 && sma50 > 0
      ? round(((latest.close - sma50) / sma50) * 100, 4)
      : null;

  if (sorted.length < 20) {
    warnings.push('INSUFFICIENT_CANDLES_FOR_SMA_20');
  }
  if (sorted.length < 50) {
    warnings.push('INSUFFICIENT_CANDLES_FOR_SMA_50');
  }
  if (sorted.length < 200) {
    warnings.push('INSUFFICIENT_CANDLES_FOR_SMA_200');
  }
  if (sorted.length < 15) {
    warnings.push('INSUFFICIENT_CANDLES_FOR_RSI_14');
    warnings.push('INSUFFICIENT_CANDLES_FOR_ATR_14');
  }
  if (
    sorted.length < 20 ||
    sorted.slice(-20).some((candle) => candle.volume == null)
  ) {
    warnings.push('INSUFFICIENT_VOLUME_FOR_AVERAGE_20');
  }

  return {
    sma20,
    sma50,
    sma200,
    rsi14,
    atr14,
    volumeAverage20,
    volumeRatio,
    distanceFromSma50,
    warnings,
  };
}

function calculateSma(candles: IndicatorCandle[], period: number) {
  if (candles.length < period) {
    return null;
  }

  const closes = candles.slice(-period).map((candle) => candle.close);
  return round(sum(closes) / period, 4);
}

function calculateRsi(candles: IndicatorCandle[], period: number) {
  if (candles.length < period + 1) {
    return null;
  }

  const window = candles.slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < window.length; index += 1) {
    const change = window[index].close - window[index - 1].close;
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;

  if (averageLoss === 0) {
    return averageGain === 0 ? 50 : 100;
  }

  const relativeStrength = averageGain / averageLoss;
  return round(100 - 100 / (1 + relativeStrength), 4);
}

function calculateAtr(candles: IndicatorCandle[], period: number) {
  if (candles.length < period + 1) {
    return null;
  }

  const window = candles.slice(-(period + 1));
  const trueRanges: number[] = [];

  for (let index = 1; index < window.length; index += 1) {
    const candle = window[index];
    const previousClose = window[index - 1].close;
    trueRanges.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      ),
    );
  }

  return round(sum(trueRanges) / period, 4);
}

function calculateVolumeAverage(candles: IndicatorCandle[], period: number) {
  if (candles.length < period) {
    return null;
  }

  const volumes = candles.slice(-period).map((candle) => candle.volume);
  if (volumes.some((volume) => volume == null)) {
    return null;
  }

  return round(sum(volumes as number[]) / period, 4);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
