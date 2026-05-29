import { PortfolioAssetClass } from '../../generated/prisma/client';
import type {
  DhanFundLimit,
  DhanHolding,
  DhanOrder,
  DhanPosition,
  DhanTrade,
} from './dhan.types';

export type NormalizedDhanHolding = ReturnType<typeof normalizeDhanHolding>;
export type NormalizedDhanPosition = ReturnType<typeof normalizeDhanPosition>;
export type NormalizedDhanOrder = ReturnType<typeof normalizeDhanOrder>;
export type NormalizedDhanTrade = ReturnType<typeof normalizeDhanTrade>;
export type NormalizedDhanFundLimit = ReturnType<typeof normalizeDhanFundLimit>;

export function normalizeDhanHolding(row: DhanHolding) {
  const totalQty = numeric(row.totalQty);
  const avgCostPrice = numeric(row.avgCostPrice);
  const costValue = roundMoney(totalQty * avgCostPrice);

  return {
    exchange: textOrNull(row.exchange),
    tradingSymbol: requiredText(row.tradingSymbol, 'holding.tradingSymbol'),
    securityId: requiredText(row.securityId, 'holding.securityId'),
    isin: textOrNull(row.isin),
    assetClass: inferListedAssetClass(row),
    totalQty,
    dpQty: numeric(row.dpQty),
    t1Qty: numeric(row.t1Qty),
    availableQty: numeric(row.availableQty),
    collateralQty: numeric(row.collateralQty),
    avgCostPrice,
    costValue,
    marketValue: costValue,
  };
}

export function normalizeDhanPosition(row: DhanPosition) {
  return {
    dhanClientId: textOrNull(row.dhanClientId),
    tradingSymbol: requiredText(row.tradingSymbol, 'position.tradingSymbol'),
    securityId: requiredText(row.securityId, 'position.securityId'),
    positionType: textOrNull(row.positionType),
    exchangeSegment: textOrNull(row.exchangeSegment),
    productType: textOrNull(row.productType),
    buyAvg: numeric(row.buyAvg),
    buyQty: numeric(row.buyQty),
    costPrice: numeric(row.costPrice),
    sellAvg: numeric(row.sellAvg),
    sellQty: numeric(row.sellQty),
    netQty: numeric(row.netQty),
    realizedProfit: numeric(row.realizedProfit),
    unrealizedProfit: numeric(row.unrealizedProfit),
    carryForwardBuyQty: numeric(row.carryForwardBuyQty),
    carryForwardSellQty: numeric(row.carryForwardSellQty),
    dayBuyQty: numeric(row.dayBuyQty),
    daySellQty: numeric(row.daySellQty),
    dayBuyValue: numeric(row.dayBuyValue),
    daySellValue: numeric(row.daySellValue),
  };
}

export function normalizeDhanOrder(row: DhanOrder) {
  const fallbackOrderId = [
    row.correlationId,
    row.securityId,
    row.createTime,
  ].filter(Boolean);

  return {
    dhanClientId: textOrNull(row.dhanClientId),
    orderId:
      textOrNull(row.orderId) ??
      requiredText(fallbackOrderId.join(':'), 'order.orderId'),
    correlationId: textOrNull(row.correlationId),
    orderStatus: textOrNull(row.orderStatus),
    transactionType: textOrNull(row.transactionType),
    exchangeSegment: textOrNull(row.exchangeSegment),
    productType: textOrNull(row.productType),
    orderType: textOrNull(row.orderType),
    validity: textOrNull(row.validity),
    tradingSymbol: textOrNull(row.tradingSymbol),
    securityId: textOrNull(row.securityId),
    quantity: numeric(row.quantity),
    price: numeric(row.price),
    triggerPrice: numeric(row.triggerPrice),
    remainingQuantity: numeric(row.remainingQuantity),
    averageTradedPrice: numeric(row.averageTradedPrice),
    filledQty: numeric(row.filledQty),
    createTime: parseDhanDate(row.createTime),
    updateTime: parseDhanDate(row.updateTime),
    exchangeTime: parseDhanDate(row.exchangeTime),
  };
}

export function normalizeDhanTrade(row: DhanTrade) {
  const exchangeTradeId =
    textOrNull(row.exchangeTradeId) ??
    [
      row.orderId,
      row.exchangeOrderId,
      row.securityId,
      row.exchangeTime,
      row.tradedQuantity,
      row.tradedPrice,
    ]
      .filter(Boolean)
      .join(':');

  return {
    dhanClientId: textOrNull(row.dhanClientId),
    orderId: requiredText(row.orderId, 'trade.orderId'),
    exchangeOrderId: textOrNull(row.exchangeOrderId),
    exchangeTradeId: requiredText(exchangeTradeId, 'trade.exchangeTradeId'),
    transactionType: textOrNull(row.transactionType),
    exchangeSegment: textOrNull(row.exchangeSegment),
    productType: textOrNull(row.productType),
    orderType: textOrNull(row.orderType),
    tradingSymbol: textOrNull(row.tradingSymbol),
    securityId: textOrNull(row.securityId),
    tradedQuantity: numeric(row.tradedQuantity),
    tradedPrice: numeric(row.tradedPrice),
    createTime: parseDhanDate(row.createTime),
    updateTime: parseDhanDate(row.updateTime),
    exchangeTime: parseDhanDate(row.exchangeTime),
  };
}

export function normalizeDhanFundLimit(row: DhanFundLimit) {
  const availableBalance = numeric(
    row.availableBalance ?? row.availabelBalance,
  );

  return {
    dhanClientId: textOrNull(row.dhanClientId),
    availableBalance,
    sodLimit: numeric(row.sodLimit),
    collateralAmount: numeric(row.collateralAmount),
    receivableAmount: numeric(row.receivableAmount),
    utilizedAmount: numeric(row.utilizedAmount),
    blockedPayoutAmount: numeric(row.blockedPayoutAmount),
    withdrawableBalance: numeric(row.withdrawableBalance),
  };
}

function inferListedAssetClass(row: DhanHolding) {
  const symbol = String(row.tradingSymbol ?? '').toUpperCase();

  if (/\bETF\b|BEES|IETF|NIFTYETF|SENSEXETF|GOLDETF/.test(symbol)) {
    return PortfolioAssetClass.ETF;
  }

  return PortfolioAssetClass.STOCK;
}

function numeric(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function textOrNull(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function requiredText(
  value: string | number | null | undefined,
  field: string,
) {
  const text = textOrNull(value);

  if (!text) {
    throw new Error(`Dhan ${field} is required`);
  }

  return text;
}

function parseDhanDate(value: string | null | undefined) {
  const text = textOrNull(value);

  if (!text) {
    return null;
  }

  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}+05:30`;
  const date = new Date(withZone);

  return Number.isNaN(date.getTime()) ? null : date;
}
