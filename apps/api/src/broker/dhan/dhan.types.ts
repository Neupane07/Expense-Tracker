export type DhanHolding = {
  exchange?: string;
  tradingSymbol?: string;
  securityId?: string;
  isin?: string;
  totalQty?: number | string;
  dpQty?: number | string;
  t1Qty?: number | string;
  availableQty?: number | string;
  collateralQty?: number | string;
  avgCostPrice?: number | string;
};

export type DhanPosition = {
  dhanClientId?: string;
  tradingSymbol?: string;
  securityId?: string;
  positionType?: string;
  exchangeSegment?: string;
  productType?: string;
  buyAvg?: number | string;
  buyQty?: number | string;
  costPrice?: number | string;
  sellAvg?: number | string;
  sellQty?: number | string;
  netQty?: number | string;
  realizedProfit?: number | string;
  unrealizedProfit?: number | string;
  carryForwardBuyQty?: number | string;
  carryForwardSellQty?: number | string;
  dayBuyQty?: number | string;
  daySellQty?: number | string;
  dayBuyValue?: number | string;
  daySellValue?: number | string;
};

export type DhanOrder = {
  dhanClientId?: string;
  orderId?: string;
  correlationId?: string;
  orderStatus?: string;
  transactionType?: string;
  exchangeSegment?: string;
  productType?: string;
  orderType?: string;
  validity?: string;
  tradingSymbol?: string;
  securityId?: string;
  quantity?: number | string;
  price?: number | string;
  triggerPrice?: number | string;
  remainingQuantity?: number | string;
  averageTradedPrice?: number | string;
  filledQty?: number | string;
  createTime?: string;
  updateTime?: string;
  exchangeTime?: string;
};

export type DhanTrade = {
  dhanClientId?: string;
  orderId?: string;
  exchangeOrderId?: string;
  exchangeTradeId?: string;
  transactionType?: string;
  exchangeSegment?: string;
  productType?: string;
  orderType?: string;
  tradingSymbol?: string;
  securityId?: string;
  tradedQuantity?: number | string;
  tradedPrice?: number | string;
  createTime?: string;
  updateTime?: string;
  exchangeTime?: string;
};

export type DhanFundLimit = {
  dhanClientId?: string;
  availabelBalance?: number | string;
  availableBalance?: number | string;
  sodLimit?: number | string;
  collateralAmount?: number | string;
  receivableAmount?: number | string;
  utilizedAmount?: number | string;
  blockedPayoutAmount?: number | string;
  withdrawableBalance?: number | string;
};

export type DhanCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  clientId: string;
  baseUrl: string;
};

export type DhanMarketRow = {
  last_price?: number;
  volume?: number;
  ohlc?: {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  };
};

export type DhanQuoteRow = DhanMarketRow;

export type DhanMarketFeedResponse = {
  data?: Record<string, Record<string, DhanMarketRow>>;
  status?: string;
};

export type DhanQuoteResponse = DhanMarketFeedResponse;

export type DhanAccessTokenResponse = {
  dhanClientId?: string;
  dhanClientName?: string;
  dhanClientUcc?: string;
  givenPowerOfAttorney?: boolean;
  accessToken?: string;
  expiryTime?: string;
};

export type DhanConsentResponse = {
  consentAppId?: string;
  consentAppStatus?: string;
  status?: string;
};

export type DhanHistoricalResponse = {
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  volume?: number[];
  timestamp?: number[];
};
