import { DhanMarketDataProviderService } from './dhan-market-data-provider.service';

describe('DhanMarketDataProviderService bulk fetch', () => {
  it('requests all segments in one OHLC call', async () => {
    const dhanClient = {
      getMarketOhlc: jest.fn().mockResolvedValue({
        data: {
          NSE_EQ: {
            1: { last_price: 100, ohlc: { close: 95 } },
          },
          BSE_EQ: {
            2: { last_price: 200, ohlc: { close: 190 } },
          },
        },
      }),
      getMarketQuotes: jest.fn(),
    };

    const provider = new DhanMarketDataProviderService(dhanClient as never);
    const result = await provider.fetchLatestPricesBulk('user-1', [
      { exchange: 'NSE', securityId: '1' },
      { exchange: 'BSE', securityId: '2' },
    ]);

    expect(dhanClient.getMarketOhlc).toHaveBeenCalledTimes(1);
    expect(dhanClient.getMarketOhlc).toHaveBeenCalledWith('user-1', {
      NSE_EQ: ['1'],
      BSE_EQ: ['2'],
    });
    expect(dhanClient.getMarketQuotes).not.toHaveBeenCalled();
    expect(result.size).toBe(2);
  });
});
