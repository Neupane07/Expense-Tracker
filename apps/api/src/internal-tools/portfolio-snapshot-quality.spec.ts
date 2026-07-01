import { assessPortfolioSnapshotQuality } from './portfolio-snapshot-quality';

describe('assessPortfolioSnapshotQuality', () => {
  it('rejects stale listed prices even when priceAsOf is present', () => {
    const quality = assessPortfolioSnapshotQuality({
      warnings: ['PRICE_STALE'],
      listedSummary: { fallbackCount: 0, holdingCount: 2 },
      priceAsOf: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(quality.status).toBe('rejected');
    expect(quality.rejectReasons).toContain('PRICE_STALE');
    expect(quality.freshness).not.toBe('RECENT');
  });

  it('marks missing portfolio context as unavailable', () => {
    const quality = assessPortfolioSnapshotQuality({
      warnings: ['No synced Dhan holdings are available.'],
      listedSummary: { fallbackCount: 0, holdingCount: 0 },
      priceAsOf: null,
    });

    expect(quality.status).toBe('unavailable');
    expect(quality.rejectReasons).toContain('PORTFOLIO_CONTEXT_INCOMPLETE');
  });
});
