export const DHAN_MARKET_DATA_SOURCE = 'DHAN';

export const DHAN_CANDLE_ADJUSTMENT_POLICY = 'DHAN_PROVIDER_DAILY_ADJUSTED';

export const DHAN_CANDLE_ADJUSTMENT_DOCUMENTATION_URL =
  'https://dhan.co/support/platforms/dhanhq-api/is-the-historical-data-from-dhan-s-data-api-adjusted-for-corporate-actions-like-bonuses-and-splits/';

export const NSE_CORPORATE_ACTION_EVENT_SOURCE = 'NSE_EOD_CA';

export const MANUAL_CORPORATE_ACTION_IMPORT_SOURCE = 'MANUAL_IMPORT';

export const CORPORATE_ACTION_EVENT_SYNC_STALE_DAYS = 30;

export const PRICE_AFFECTING_EVENT_TYPES = new Set([
  'SPLIT',
  'BONUS',
  'RIGHTS',
  'MERGER',
  'DEMERGER',
  'SYMBOL_CHANGE',
]);
