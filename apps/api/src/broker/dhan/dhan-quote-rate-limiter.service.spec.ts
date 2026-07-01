import { DhanQuoteRateLimiterService } from './dhan-quote-rate-limiter.service';

describe('DhanQuoteRateLimiterService', () => {
  it('serializes quote requests for the same user at least 1 second apart', async () => {
    const limiter = new DhanQuoteRateLimiterService();
    const timestamps: number[] = [];

    await Promise.all([
      limiter.schedule('user-1', 'ohlc:NSE_EQ', () => {
        timestamps.push(Date.now());
        return Promise.resolve();
      }),
      limiter.schedule('user-1', 'ohlc:BSE_EQ', () => {
        timestamps.push(Date.now());
        return Promise.resolve();
      }),
    ]);

    expect(timestamps).toHaveLength(2);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(1_000);
  });

  it('coalesces duplicate in-flight requests with the same key', async () => {
    const limiter = new DhanQuoteRateLimiterService();
    let calls = 0;

    const task = async () => {
      calls += 1;
      await sleep(20);
      return 'price';
    };

    const [first, second] = await Promise.all([
      limiter.schedule('user-1', 'ohlc:NSE_EQ:1', task),
      limiter.schedule('user-1', 'ohlc:NSE_EQ:1', task),
    ]);

    expect(first).toBe('price');
    expect(second).toBe('price');
    expect(calls).toBe(1);
  });

  it('does not block quote requests for different users', async () => {
    const limiter = new DhanQuoteRateLimiterService();
    const timestamps: number[] = [];

    await Promise.all([
      limiter.schedule('user-1', 'ohlc:NSE_EQ', () => {
        timestamps.push(Date.now());
        return Promise.resolve();
      }),
      limiter.schedule('user-2', 'ohlc:NSE_EQ', () => {
        timestamps.push(Date.now());
        return Promise.resolve();
      }),
    ]);

    expect(timestamps).toHaveLength(2);
    expect(Math.abs(timestamps[1] - timestamps[0])).toBeLessThan(500);
  });
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
