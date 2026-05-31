import { PortfolioAssetClass } from '../generated/prisma/client';
import { AllocationService } from './allocation.service';

describe('AllocationService', () => {
  it('calculates stock ETF mutual fund and cash allocation percentages', () => {
    const service = new AllocationService();

    const allocation = service.calculateStockEtfCashAllocation(
      [
        {
          assetClass: PortfolioAssetClass.STOCK,
          marketValue: 600,
        },
        {
          assetClass: PortfolioAssetClass.STOCK,
          marketValue: 400,
        },
        {
          assetClass: PortfolioAssetClass.ETF,
          marketValue: 500,
        },
      ],
      500,
      500,
    );

    expect(allocation).toEqual({
      stockValue: 1000,
      etfValue: 500,
      mutualFundValue: 500,
      cashValue: 500,
      totalValue: 2500,
      stockPercent: 40,
      etfPercent: 20,
      mutualFundPercent: 20,
      cashPercent: 20,
    });
  });

  it('returns zero percentages when there is no synced value', () => {
    const service = new AllocationService();

    expect(service.calculateStockEtfCashAllocation([], 0)).toEqual({
      stockValue: 0,
      etfValue: 0,
      mutualFundValue: 0,
      cashValue: 0,
      totalValue: 0,
      stockPercent: 0,
      etfPercent: 0,
      mutualFundPercent: 0,
      cashPercent: 0,
    });
  });
});
