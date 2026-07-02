import type { InstrumentVerificationService } from '../market-data/instrument-verification.service';
import { DHAN_CANDLE_ADJUSTMENT_POLICY } from '../market-data/corporate-action.constants';

export function evaluateCandleCorporateActionPolicy(
  instrumentVerification: InstrumentVerificationService,
  candles: Array<{
    isAdjusted?: boolean;
    source?: string;
    adjustmentPolicy?: string | null;
    dataQuality?: unknown;
  }>,
) {
  return instrumentVerification.evaluateCorporateActionPolicy({
    candleCount: candles.length,
    unadjustedCount: candles.filter((candle) => !candle.isAdjusted).length,
    candles: candles.map((candle) => ({
      source: candle.source ?? null,
      isAdjusted: candle.isAdjusted,
      dataQuality:
        candle.dataQuality && typeof candle.dataQuality === 'object'
          ? (candle.dataQuality as Record<string, unknown>)
          : candle.adjustmentPolicy
            ? { adjustmentPolicy: candle.adjustmentPolicy }
            : candle.isAdjusted
              ? { adjustmentPolicy: DHAN_CANDLE_ADJUSTMENT_POLICY }
              : null,
    })),
  });
}
