export type ReconcilableHolding = {
  tradingSymbol: string;
  securityId: string;
  totalQty: number;
  availableQty: number;
  costValue: number;
  marketValue: number;
};

export type ReconcilablePosition = {
  tradingSymbol: string;
  securityId: string;
  productType: string | null;
  netQty: number;
  daySellQty: number;
  sellQty: number;
};

export type ReconcilableOrder = {
  tradingSymbol: string | null;
  securityId: string | null;
  orderStatus: string | null;
  transactionType: string | null;
  productType: string | null;
  filledQty: number;
  updateTime: Date | null;
  exchangeTime: Date | null;
};

export type ReconciledHolding<T extends ReconcilableHolding> = T & {
  totalQty: number;
  availableQty: number;
  costValue: number;
  marketValue: number;
};

export function reconcileDhanHoldings<T extends ReconcilableHolding>(
  holdings: T[],
  positions: ReconcilablePosition[],
  orders: ReconcilableOrder[],
  syncAsOf: Date,
): ReconciledHolding<T>[] {
  const soldQtyByKey = buildSoldQtyMap(positions, orders, syncAsOf);

  return holdings
    .map((holding) => applySoldQty(holding, soldQtyByKey))
    .filter((holding): holding is ReconciledHolding<T> => holding !== null);
}

function buildSoldQtyMap(
  positions: ReconcilablePosition[],
  orders: ReconcilableOrder[],
  syncAsOf: Date,
) {
  const soldQtyByKey = new Map<string, number>();

  for (const position of positions) {
    const soldQty = soldQtyFromPosition(position);

    if (soldQty <= 0) {
      continue;
    }

    addSoldQty(soldQtyByKey, positionKey(position), soldQty);
  }

  for (const order of orders) {
    if (!isSameDayTradedDeliverySell(order, syncAsOf)) {
      continue;
    }

    const key = orderKey(order);

    if (!key || soldQtyByKey.has(key)) {
      continue;
    }

    addSoldQty(soldQtyByKey, key, order.filledQty);
  }

  return soldQtyByKey;
}

function applySoldQty<T extends ReconcilableHolding>(
  holding: T,
  soldQtyByKey: Map<string, number>,
) {
  if (holding.totalQty <= 0) {
    return null;
  }

  const soldQty = soldQtyByKey.get(holdingKey(holding)) ?? 0;
  const effectiveQty = roundQty(holding.totalQty - soldQty);

  if (effectiveQty <= 0) {
    return null;
  }

  if (soldQty <= 0) {
    return holding;
  }

  const ratio = effectiveQty / holding.totalQty;

  return {
    ...holding,
    totalQty: effectiveQty,
    availableQty: roundQty(Math.min(holding.availableQty, effectiveQty)),
    costValue: roundMoney(holding.costValue * ratio),
    marketValue: roundMoney(holding.marketValue * ratio),
  };
}

function soldQtyFromPosition(position: ReconcilablePosition) {
  if (!isDeliveryProduct(position.productType) || position.netQty > 0) {
    return 0;
  }

  if (position.daySellQty > 0) {
    return position.daySellQty;
  }

  return position.sellQty > 0 ? position.sellQty : 0;
}

function isDeliveryProduct(productType: string | null) {
  const normalized = (productType ?? '').trim().toUpperCase();

  return (
    normalized === 'CNC' ||
    normalized === 'DELIVERY' ||
    normalized.includes('CNC')
  );
}

function isSameDayTradedDeliverySell(order: ReconcilableOrder, syncAsOf: Date) {
  if (!isTradedSellDelivery(order)) {
    return false;
  }

  const eventTime = order.updateTime ?? order.exchangeTime;

  if (!eventTime) {
    return false;
  }

  return isSameTradingDay(eventTime, syncAsOf);
}

function isTradedSellDelivery(order: ReconcilableOrder) {
  const status = (order.orderStatus ?? '').trim().toUpperCase();
  const side = (order.transactionType ?? '').trim().toUpperCase();

  return (
    status === 'TRADED' &&
    side === 'SELL' &&
    isDeliveryProduct(order.productType) &&
    order.filledQty > 0
  );
}

function isSameTradingDay(left: Date, right: Date) {
  return toIstDateKey(left) === toIstDateKey(right);
}

function toIstDateKey(value: Date) {
  return value.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function holdingKey(holding: ReconcilableHolding) {
  return positionKey(holding);
}

function positionKey(row: { securityId: string; tradingSymbol: string }) {
  const securityId = row.securityId.trim();

  if (securityId.length > 0) {
    return `id:${securityId}`;
  }

  return `sym:${row.tradingSymbol.trim().toUpperCase()}`;
}

function orderKey(order: ReconcilableOrder) {
  const securityId = order.securityId?.trim();

  if (securityId) {
    return `id:${securityId}`;
  }

  const tradingSymbol = order.tradingSymbol?.trim().toUpperCase();

  return tradingSymbol ? `sym:${tradingSymbol}` : null;
}

function addSoldQty(
  soldQtyByKey: Map<string, number>,
  key: string,
  soldQty: number,
) {
  soldQtyByKey.set(key, roundQty((soldQtyByKey.get(key) ?? 0) + soldQty));
}

function roundQty(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
