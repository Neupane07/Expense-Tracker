import type { InstrumentVerificationService } from '../market-data/instrument-verification.service';

export function evaluateCandleCorporateActionPolicy(
  instrumentVerification: InstrumentVerificationService,
  candles: Array<{ isAdjusted?: boolean }>,
) {
  return instrumentVerification.evaluateCorporateActionPolicy({
    candleCount: candles.length,
    unadjustedCount: candles.filter((candle) => !candle.isAdjusted).length,
    providerClaimsAdjusted: false,
  });
}
