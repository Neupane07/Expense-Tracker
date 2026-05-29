import { PortfolioAssetClass } from '../generated/prisma/client';
import { AllocationService } from './allocation.service';

describe('AllocationService', () => {
  it('calculates stock ETF and cash allocation percentages', () => {
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
    );

    expect(allocation).toEqual({
      stockValue: 1000,
      etfValue: 500,
      cashValue: 500,
      totalValue: 2000,
      stockPercent: 50,
      etfPercent: 25,
      cashPercent: 25,
    });
  });

  it('returns zero percentages when there is no synced value', () => {
    const service = new AllocationService();

    expect(service.calculateStockEtfCashAllocation([], 0)).toEqual({
      stockValue: 0,
      etfValue: 0,
      cashValue: 0,
      totalValue: 0,
      stockPercent: 0,
      etfPercent: 0,
      cashPercent: 0,
    });
  });
});
