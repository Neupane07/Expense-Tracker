import { PortfolioAssetClass } from '../../generated/prisma/client';
import {
  normalizeDhanFundLimit,
  normalizeDhanHolding,
  normalizeDhanOrder,
} from './dhan-normalizers';

describe('Dhan normalizers', () => {
  it('normalizes holdings and infers ETFs from symbols', () => {
    const holding = normalizeDhanHolding({
      exchange: 'NSE',
      tradingSymbol: 'NIFTYBEES',
      securityId: '10576',
      isin: 'INF204KB14I2',
      totalQty: '3',
      dpQty: '2',
      t1Qty: '1',
      availableQty: '3',
      collateralQty: '',
      avgCostPrice: '240.125',
    });

    expect(holding).toEqual(
      expect.objectContaining({
        tradingSymbol: 'NIFTYBEES',
        assetClass: PortfolioAssetClass.ETF,
        totalQty: 3,
        dpQty: 2,
        t1Qty: 1,
        collateralQty: 0,
        avgCostPrice: 240.125,
        costValue: 720.38,
        marketValue: 720.38,
      }),
    );
  });

  it('keeps the Dhan fund-limit available balance typo compatible', () => {
    const fund = normalizeDhanFundLimit({
      dhanClientId: '1100110011',
      availabelBalance: '12345.67',
      sodLimit: '20000',
      utilizedAmount: '1250.25',
    });

    expect(fund).toEqual(
      expect.objectContaining({
        dhanClientId: '1100110011',
        availableBalance: 12345.67,
        sodLimit: 20000,
        utilizedAmount: 1250.25,
        withdrawableBalance: 0,
      }),
    );
  });

  it('parses Dhan order timestamps as India time when no zone is provided', () => {
    const order = normalizeDhanOrder({
      orderId: 'order-1',
      tradingSymbol: 'INFY',
      securityId: '1594',
      createTime: '2026-05-29 09:20:00',
    });

    expect(order.createTime?.toISOString()).toBe('2026-05-29T03:50:00.000Z');
  });
});
