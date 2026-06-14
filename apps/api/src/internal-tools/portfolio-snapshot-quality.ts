import { MarketDataQualityService } from '../market-data/market-data-quality.service';
import type { ToolExecutionStatus } from './tool.types';

const marketQuality = new MarketDataQualityService();

export function assessPortfolioSnapshotQuality(snapshot: {
  warnings?: string[];
  listedSummary?: { fallbackCount?: number; holdingCount?: number };
  priceAsOf?: Date | string | null;
}): {
  status: ToolExecutionStatus;
  freshness: string;
  confidence: string;
  warnings: string[];
  rejectReasons: string[];
} {
  const warnings = [...(snapshot.warnings ?? [])];
  const rejectReasons: string[] = [];
  const hasMissingContext = warnings.some((warning) =>
    /missing|unavailable|no synced/i.test(warning),
  );
  const hasStalePriceCode = warnings.includes('PRICE_STALE');
  const hasFallback = (snapshot.listedSummary?.fallbackCount ?? 0) > 0;

  const priceAsOf = snapshot.priceAsOf ? new Date(snapshot.priceAsOf) : null;
  const priceQuality = marketQuality.priceQuality(priceAsOf);

  if (priceQuality.dataQuality.freshness === 'MISSING') {
    rejectReasons.push('PRICE_MISSING');
  }
  if (priceQuality.dataQuality.freshness === 'STALE' || hasStalePriceCode) {
    rejectReasons.push('PRICE_STALE');
  }
  if (hasMissingContext) {
    rejectReasons.push('PORTFOLIO_CONTEXT_INCOMPLETE');
  }
  if (hasFallback) {
    warnings.push('LISTED_HOLDINGS_USE_FALLBACK_PRICING');
  }

  warnings.push(...priceQuality.warnings);

  let freshness = priceQuality.dataQuality.freshness;
  let confidence = priceQuality.dataQuality.confidence;
  if (rejectReasons.includes('PRICE_STALE')) {
    freshness = 'STALE';
    confidence = 'LOW';
  }
  if (rejectReasons.includes('PRICE_MISSING')) {
    freshness = 'MISSING';
    confidence = 'LOW';
  }

  let status: ToolExecutionStatus = 'ok';
  if (
    rejectReasons.includes('PORTFOLIO_CONTEXT_INCOMPLETE') ||
    rejectReasons.includes('PRICE_MISSING')
  ) {
    status = 'unavailable';
  } else if (rejectReasons.length > 0) {
    status = 'rejected';
  }

  return {
    status,
    freshness,
    confidence,
    warnings: [...new Set(warnings)],
    rejectReasons: [...new Set(rejectReasons)],
  };
}
