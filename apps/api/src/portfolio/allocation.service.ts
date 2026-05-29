import { Injectable } from '@nestjs/common';
import { PortfolioAssetClass } from '../generated/prisma/client';

export type AllocationInput = {
  assetClass: PortfolioAssetClass;
  marketValue: number;
};

export type AllocationResult = {
  stockValue: number;
  etfValue: number;
  cashValue: number;
  totalValue: number;
  stockPercent: number;
  etfPercent: number;
  cashPercent: number;
};

@Injectable()
export class AllocationService {
  calculateStockEtfCashAllocation(
    holdings: AllocationInput[],
    cashValue: number,
  ): AllocationResult {
    const stockValue = holdings
      .filter((holding) => holding.assetClass === PortfolioAssetClass.STOCK)
      .reduce((total, holding) => total + holding.marketValue, 0);
    const etfValue = holdings
      .filter((holding) => holding.assetClass === PortfolioAssetClass.ETF)
      .reduce((total, holding) => total + holding.marketValue, 0);
    const roundedCashValue = roundMoney(cashValue);
    const totalValue = roundMoney(stockValue + etfValue + roundedCashValue);

    return {
      stockValue: roundMoney(stockValue),
      etfValue: roundMoney(etfValue),
      cashValue: roundedCashValue,
      totalValue,
      stockPercent: percent(stockValue, totalValue),
      etfPercent: percent(etfValue, totalValue),
      cashPercent: percent(roundedCashValue, totalValue),
    };
  }
}

function percent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 10000) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
