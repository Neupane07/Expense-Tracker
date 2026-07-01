import { PortfolioService } from './portfolio.service';

describe('PortfolioService sync flow', () => {
  it('returns sync snapshot and cached holdings without forcing another live quote fetch', async () => {
    const sync = {
      syncRunId: 'sync-1',
      provider: 'DHAN',
      counts: { holdings: 2 },
    };
    const snapshot = {
      id: 'snapshot-1',
      snapshotTime: new Date().toISOString(),
    };
    const holdings = {
      holdings: [],
      summary: { holdingCount: 0 },
      priceAsOf: new Date().toISOString(),
      warnings: [],
    };

    const brokerService = {
      syncDhan: jest.fn().mockResolvedValue(sync),
    };
    const portfolioSnapshotService = {
      createSnapshotFromLatest: jest.fn().mockResolvedValue(snapshot),
      getLatestSnapshot: jest.fn(),
    };
    const holdingsValuation = { value: jest.fn() };
    const service = new PortfolioService(
      {} as never,
      brokerService as never,
      portfolioSnapshotService as never,
      {} as never,
      {
        findReconciledHoldings: jest.fn().mockResolvedValue({ holdings: [] }),
      } as never,
      holdingsValuation as never,
    );

    const getHoldingsSpy = jest
      .spyOn(service, 'getHoldings')
      .mockResolvedValue(holdings as never);

    const result = await service.syncDhan('user-1');

    expect(
      portfolioSnapshotService.createSnapshotFromLatest,
    ).toHaveBeenCalledWith('user-1', 'sync-1');
    expect(getHoldingsSpy).toHaveBeenCalledWith('user-1', {
      preferCachedPrices: true,
    });
    expect(result).toEqual({ sync, snapshot, holdings });
  });

  it('reads the latest stored snapshot instead of creating a new one on GET snapshot', async () => {
    const latest = { id: 'snapshot-latest' };
    const portfolioSnapshotService = {
      getLatestSnapshot: jest.fn().mockResolvedValue(latest),
      createSnapshotFromLatest: jest.fn(),
    };
    const service = new PortfolioService(
      {} as never,
      {} as never,
      portfolioSnapshotService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.getSnapshot('user-1');

    expect(portfolioSnapshotService.getLatestSnapshot).toHaveBeenCalledWith(
      'user-1',
    );
    expect(
      portfolioSnapshotService.createSnapshotFromLatest,
    ).not.toHaveBeenCalled();
    expect(result).toBe(latest);
  });
});
