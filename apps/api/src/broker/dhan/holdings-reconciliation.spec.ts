import { reconcileDhanHoldings } from './holdings-reconciliation';

describe('reconcileDhanHoldings', () => {
  const syncAsOf = new Date('2026-06-01T05:40:00.000Z');

  it('removes holdings fully sold from portfolio today via CNC positions', () => {
    const holdings = [
      {
        tradingSymbol: 'TECHM',
        securityId: '13538',
        totalQty: 14,
        availableQty: 14,
        costValue: 20_139,
        marketValue: 20_139,
      },
      {
        tradingSymbol: 'TCS',
        securityId: '11536',
        totalQty: 18,
        availableQty: 18,
        costValue: 42_697,
        marketValue: 42_697,
      },
    ];

    const positions = [
      {
        tradingSymbol: 'TECHM',
        securityId: '13538',
        productType: 'CNC',
        netQty: -14,
        daySellQty: 14,
        sellQty: 14,
      },
    ];

    const reconciled = reconcileDhanHoldings(holdings, positions, [], syncAsOf);

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]?.tradingSymbol).toBe('TCS');
  });

  it('scales values when only part of a holding was sold today', () => {
    const holdings = [
      {
        tradingSymbol: 'INFY',
        securityId: '1594',
        totalQty: 20,
        availableQty: 20,
        costValue: 10_000,
        marketValue: 10_000,
      },
    ];

    const positions = [
      {
        tradingSymbol: 'INFY',
        securityId: '1594',
        productType: 'CNC',
        netQty: -5,
        daySellQty: 5,
        sellQty: 5,
      },
    ];

    const reconciled = reconcileDhanHoldings(holdings, positions, [], syncAsOf);

    expect(reconciled).toEqual([
      expect.objectContaining({
        tradingSymbol: 'INFY',
        totalQty: 15,
        availableQty: 15,
        costValue: 7_500,
        marketValue: 7_500,
      }),
    ]);
  });

  it('uses same-day traded CNC sell orders only when positions are missing', () => {
    const holdings = [
      {
        tradingSymbol: 'TECHM',
        securityId: '13538',
        totalQty: 14,
        availableQty: 14,
        costValue: 20_139,
        marketValue: 20_139,
      },
    ];

    const orders = [
      {
        tradingSymbol: 'TECHM',
        securityId: '13538',
        orderStatus: 'TRADED',
        transactionType: 'SELL',
        productType: 'CNC',
        filledQty: 14,
        updateTime: new Date('2026-06-01T05:30:00.000Z'),
        exchangeTime: new Date('2026-06-01T05:30:00.000Z'),
      },
    ];

    const reconciled = reconcileDhanHoldings(holdings, [], orders, syncAsOf);

    expect(reconciled).toHaveLength(0);
  });

  it('ignores older traded sell orders from previous days', () => {
    const holdings = [
      {
        tradingSymbol: 'TECHM',
        securityId: '13538',
        totalQty: 14,
        availableQty: 14,
        costValue: 20_139,
        marketValue: 20_139,
      },
    ];

    const orders = [
      {
        tradingSymbol: 'TECHM',
        securityId: '13538',
        orderStatus: 'TRADED',
        transactionType: 'SELL',
        productType: 'CNC',
        filledQty: 14,
        updateTime: new Date('2026-05-30T05:30:00.000Z'),
        exchangeTime: new Date('2026-05-30T05:30:00.000Z'),
      },
    ];

    const reconciled = reconcileDhanHoldings(holdings, [], orders, syncAsOf);

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]?.tradingSymbol).toBe('TECHM');
  });
});
