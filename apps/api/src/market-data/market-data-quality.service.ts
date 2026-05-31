import { Injectable } from '@nestjs/common';

export type DataQuality = {
  freshness: 'LIVE' | 'RECENT' | 'STALE' | 'MISSING';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

@Injectable()
export class MarketDataQualityService {
  priceQuality(timestamp: Date | null, asOf = new Date()) {
    if (!timestamp) {
      return {
        dataQuality: {
          freshness: 'MISSING',
          confidence: 'LOW',
        } satisfies DataQuality,
        warnings: ['PRICE_MISSING'],
      };
    }

    const ageMinutes = (asOf.getTime() - timestamp.getTime()) / 60000;

    if (ageMinutes > 24 * 60) {
      return {
        dataQuality: {
          freshness: 'STALE',
          confidence: 'LOW',
        } satisfies DataQuality,
        warnings: ['PRICE_STALE'],
      };
    }

    if (ageMinutes > 30) {
      return {
        dataQuality: {
          freshness: 'RECENT',
          confidence: 'MEDIUM',
        } satisfies DataQuality,
        warnings: [],
      };
    }

    return {
      dataQuality: {
        freshness: 'LIVE',
        confidence: 'HIGH',
      } satisfies DataQuality,
      warnings: [],
    };
  }

  candleWarnings(candleCount: number) {
    const warnings: string[] = [];

    if (candleCount === 0) {
      warnings.push('CANDLES_MISSING');
    }

    if (candleCount > 0 && candleCount < 20) {
      warnings.push('INSUFFICIENT_CANDLES');
    }

    return warnings;
  }
}
