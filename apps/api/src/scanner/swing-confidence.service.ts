import type { SwingSetupType } from './scanner.dto';

export type ConfidenceInput = {
  setupType: SwingSetupType;
  riskReward: number;
  technicalScore: number;
  volumeScore: number;
  portfolioFitScore: number;
  dataQualityScore: number;
  rsi14: number | null;
  distanceFromSma50: number | null;
  volumeRatio: number | null;
  isFallbackPrice: boolean;
  volumeMissing: boolean;
  alreadyHeldHighExposure: boolean;
  marketRegimeRiskOff: boolean;
  hasFreshNewsOrFiling: boolean;
};

export type ConfidenceResult = {
  confidenceScore: number;
  confidenceCapReason: string | null;
};

export function scoreSwingConfidence(input: ConfidenceInput): ConfidenceResult {
  const raw =
    input.technicalScore * 0.3 +
    input.volumeScore * 0.15 +
    Math.min(input.riskReward / 3, 1) * 10 * 0.2 +
    input.portfolioFitScore * 0.1 +
    input.dataQualityScore * 0.05 +
    6 * 0.1 +
    6 * 0.1;

  let score = clamp(roundScore(raw), 0, 10);
  const caps: string[] = [];

  if (input.isFallbackPrice) {
    score = Math.min(score, 6);
    caps.push('FALLBACK_PRICE_SOURCE');
  }

  if (input.volumeMissing) {
    score = Math.min(score, 6);
    caps.push('VOLUME_DATA_MISSING');
  }

  if (!input.hasFreshNewsOrFiling) {
    score = Math.min(score, 6.5);
    caps.push('NO_FRESH_NEWS_OR_FILING_CHECK');
  }

  if (input.alreadyHeldHighExposure) {
    score = Math.min(score, 6.5);
    caps.push('EXISTING_HIGH_EXPOSURE');
  }

  if (input.rsi14 != null && input.rsi14 > 70) {
    const exceptionalBreakout =
      input.setupType === 'BREAKOUT' &&
      input.volumeRatio != null &&
      input.volumeRatio >= 1.8;
    if (!exceptionalBreakout) {
      score = Math.min(score, 6.5);
      caps.push('RSI_ABOVE_70');
    }
  }

  if (
    input.distanceFromSma50 != null &&
    input.distanceFromSma50 > 15 &&
    input.setupType !== 'BREAKOUT'
  ) {
    score = Math.min(score, 6.2);
    caps.push('PRICE_EXTENDED_ABOVE_SMA_50');
  }

  if (input.marketRegimeRiskOff) {
    score = Math.min(score, 6);
    caps.push('MARKET_REGIME_RISK_OFF');
  }

  return {
    confidenceScore: roundScore(score),
    confidenceCapReason: caps.length > 0 ? caps.join(';') : null,
  };
}

export function componentScores(input: {
  riskReward: number;
  volumeRatio: number | null;
  distanceFromSma50: number | null;
  setupDetected: boolean;
  dataFreshness: string;
}) {
  const technicalScore = input.setupDetected
    ? clamp(6 + (input.distanceFromSma50 != null ? 1 : 0), 0, 10)
    : 4;
  const volumeScore =
    input.volumeRatio == null
      ? 4
      : clamp(5 + Math.min(input.volumeRatio, 2), 0, 10);
  const dataQualityScore =
    input.dataFreshness === 'LIVE'
      ? 9
      : input.dataFreshness === 'RECENT'
        ? 7
        : 4;
  const portfolioFitScore = 7;

  return { technicalScore, volumeScore, dataQualityScore, portfolioFitScore };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}
