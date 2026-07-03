/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { CorporateActionPolicyService } from './corporate-action-policy.service';
import {
  CorporateActionImportService,
  CorporateActionInvalidationService,
  CorporateActionSyncService,
} from './corporate-action.service';
import {
  DHAN_CANDLE_ADJUSTMENT_POLICY,
  DHAN_MARKET_DATA_SOURCE,
} from './corporate-action.constants';

describe('CorporateAction import and invalidation', () => {
  const policy = new CorporateActionPolicyService();

  function createInvalidationService(prisma: Record<string, unknown>) {
    return new CorporateActionInvalidationService(prisma as never, policy);
  }

  function createImportService(prisma: Record<string, unknown>) {
    const invalidation = createInvalidationService(prisma);
    return new CorporateActionImportService(
      prisma as never,
      policy,
      invalidation,
    );
  }

  it('imports split events, deduplicates, and invalidates affected candles', async () => {
    const candles: Array<{ instrumentId: string; date: Date }> = [
      { instrumentId: 'inst-1', date: new Date('2026-04-01') },
      { instrumentId: 'inst-1', date: new Date('2026-05-15') },
    ];
    const events: Array<Record<string, unknown>> = [];
    const syncRuns: Array<Record<string, unknown>> = [];

    const prisma = {
      corporateActionSyncRun: {
        create: jest.fn().mockImplementation(({ data }) => {
          const run = { id: 'run-1', ...data };
          syncRuns.push(run);
          return Promise.resolve(run);
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'run-1', ...data }),
          ),
      },
      corporateActionEvent: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) {
            return Promise.resolve(
              events.find((event) => event.id === where.id) ?? null,
            );
          }

          const match = events.find(
            (event) =>
              event.source === where.source_sourceEventId.source &&
              event.sourceEventId === where.source_sourceEventId.sourceEventId,
          );
          return Promise.resolve(match ?? null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const created = { id: `evt-${events.length + 1}`, ...data };
          events.push(created);
          return Promise.resolve(created);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const index = events.findIndex((event) => event.id === where.id);
          events[index] = { ...events[index], ...data };
          return Promise.resolve(events[index]);
        }),
      },
      instrument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inst-1',
          symbol: 'INFY',
          exchange: 'NSE',
          securityId: '123',
        }),
      },
      dailyCandle: {
        deleteMany: jest.fn().mockImplementation(({ where }) => {
          const before = candles.length;
          const cutoff = where.date.lt as Date;
          for (let index = candles.length - 1; index >= 0; index -= 1) {
            if (candles[index].date < cutoff) {
              candles.splice(index, 1);
            }
          }
          return Promise.resolve({ count: before - candles.length });
        }),
      },
      technicalIndicatorSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback) => callback(prisma)),
    };

    const importService = createImportService(prisma);

    const first = await importService.importEvents([
      {
        symbol: 'INFY',
        exchange: 'NSE',
        eventType: 'SPLIT',
        effectiveDate: '2026-05-01',
        exDate: '2026-05-01',
        ratioNumerator: 2,
        ratioDenominator: 1,
        source: 'NSE_EOD_CA',
        sourceEventId: 'split-infy-2026-05-01',
        rawEvidence: { note: 'official export' },
      },
    ]);

    expect(first.importedCount).toBe(1);
    expect(candles).toHaveLength(1);
    expect(candles[0].date.toISOString()).toContain('2026-05-15');
    expect(events[0].processedAt).toBeFalsy();
    expect(events[0].invalidationFromDate).toBeTruthy();

    const duplicate = await importService.importEvents([
      {
        symbol: 'INFY',
        exchange: 'NSE',
        eventType: 'SPLIT',
        effectiveDate: '2026-05-01',
        exDate: '2026-05-01',
        ratioNumerator: 2,
        ratioDenominator: 1,
        source: 'NSE_EOD_CA',
        sourceEventId: 'split-infy-2026-05-01',
        rawEvidence: { note: 'official export' },
      },
    ]);

    expect(duplicate.skippedCount).toBe(1);
    expect(duplicate.importedCount).toBe(0);
  });

  it('applies provider corrections by superseding prior events', async () => {
    const events: Array<Record<string, unknown>> = [];
    const prisma = {
      corporateActionSyncRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-2' }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'run-2', status: 'COMPLETED' }),
      },
      corporateActionEvent: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) {
            return Promise.resolve(
              events.find((event) => event.id === where.id) ?? null,
            );
          }

          const match = events.find(
            (event) =>
              event.source === where.source_sourceEventId.source &&
              event.sourceEventId === where.source_sourceEventId.sourceEventId,
          );
          return Promise.resolve(match ?? null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const created = { id: `evt-${events.length + 1}`, ...data };
          events.push(created);
          return Promise.resolve(created);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const index = events.findIndex((event) => event.id === where.id);
          events[index] = { ...events[index], ...data };
          return Promise.resolve(events[index]);
        }),
      },
      instrument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inst-2',
          symbol: 'TCS',
          exchange: 'NSE',
          securityId: '456',
        }),
      },
      dailyCandle: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      technicalIndicatorSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback) => callback(prisma)),
    };

    const importService = createImportService(prisma);

    await importService.importEvents([
      {
        symbol: 'TCS',
        exchange: 'NSE',
        eventType: 'BONUS',
        effectiveDate: '2026-06-10',
        exDate: '2026-06-10',
        ratioNumerator: 1,
        ratioDenominator: 1,
        source: 'NSE_EOD_CA',
        sourceEventId: 'bonus-tcs-v1',
        rawEvidence: { ratio: '1:1' },
      },
    ]);

    const corrected = await importService.importEvents([
      {
        symbol: 'TCS',
        exchange: 'NSE',
        eventType: 'BONUS',
        effectiveDate: '2026-06-10',
        exDate: '2026-06-10',
        ratioNumerator: 1,
        ratioDenominator: 2,
        source: 'NSE_EOD_CA',
        sourceEventId: 'bonus-tcs-v2',
        supersedesSourceEventId: 'bonus-tcs-v1',
        rawEvidence: { ratio: '1:2', correction: true },
      },
    ]);

    expect(corrected.correctedCount).toBe(1);
    expect(events[0].supersededAt).toBeTruthy();
    expect(events[1].sourceEventId).toBe('bonus-tcs-v2');
  });

  it('records unavailable automated provider sync with explicit blocker', async () => {
    const prisma = {
      corporateActionSyncRun: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'run-unavailable', ...data }),
          ),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      corporateActionEvent: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const syncService = new CorporateActionSyncService(
      prisma as never,
      policy,
      {} as never,
      createInvalidationService(prisma),
    );

    const result = await syncService.syncFromProvider();

    expect(result.available).toBe(false);
    expect(result.reason).toBe('NSE_EOD_CA_SUBSCRIPTION_REQUIRED');
    expect(result.run.status).toBe('UNAVAILABLE');
  });

  it('evaluates verified candles for an instrument without requiring event catalog', async () => {
    const prisma = {
      corporateActionEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      corporateActionSyncRun: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const syncService = new CorporateActionSyncService(
      prisma as never,
      policy,
      {} as never,
      createInvalidationService(prisma),
    );

    const result = await syncService.evaluateForInstrument(
      { id: 'inst-1', symbol: 'INFY', exchange: 'NSE' },
      [
        {
          source: DHAN_MARKET_DATA_SOURCE,
          isAdjusted: true,
          dataQuality: { adjustmentPolicy: DHAN_CANDLE_ADJUSTMENT_POLICY },
        },
      ],
    );

    expect(result.adjustmentStatus).toBe('VERIFIED');
    expect(result.eventCatalogStatus).toBe('NOT_CONFIGURED');
    expect(result.blocksHistoricalAnalysis).toBe(false);
  });

  it('keeps invalidated events unprocessed until rehydrated candles exist', async () => {
    const events: Array<Record<string, unknown>> = [
      {
        id: 'evt-1',
        instrumentId: 'inst-1',
        supersededAt: null,
        processedAt: null,
        invalidationFromDate: new Date('2026-05-01'),
        eventType: 'SPLIT',
      },
    ];
    const prisma = {
      corporateActionEvent: {
        findMany: jest.fn().mockResolvedValue(events),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const index = events.findIndex((event) => event.id === where.id);
          events[index] = { ...events[index], ...data };
          return Promise.resolve(events[index]);
        }),
      },
      dailyCandle: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(42),
      },
    };
    const invalidation = createInvalidationService(prisma);

    const pending = await invalidation.completeRehydrationIfReady('inst-1');
    expect(pending.completedCount).toBe(0);
    expect(events[0].processedAt).toBeFalsy();

    const completed = await invalidation.completeRehydrationIfReady('inst-1');
    expect(completed.completedCount).toBe(1);
    expect(events[0].processedAt).toBeTruthy();
  });

  it('links orphaned events when an instrument row is materialized', async () => {
    const events: Array<Record<string, unknown>> = [
      {
        id: 'evt-orphan',
        symbol: 'INFY',
        exchange: 'NSE',
        instrumentId: null,
        supersededAt: null,
        processedAt: null,
        eventType: 'SPLIT',
        exDate: new Date('2026-05-01'),
        effectiveDate: new Date('2026-05-01'),
        invalidationFromDate: new Date('2026-05-01'),
      },
    ];
    const prisma = {
      corporateActionEvent: {
        updateMany: jest.fn().mockImplementation(({ data }) => {
          events[0] = { ...events[0], ...data };
          return Promise.resolve({ count: 1 });
        }),
        findMany: jest.fn().mockResolvedValue([events[0]]),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              events.find((event) => event.id === where.id) ?? null,
            ),
          ),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const index = events.findIndex((event) => event.id === where.id);
          events[index] = { ...events[index], ...data };
          return Promise.resolve(events[index]);
        }),
      },
      dailyCandle: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      technicalIndicatorSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const invalidation = createInvalidationService(prisma);

    await invalidation.linkOrphanedEventsForInstrument({
      id: 'inst-1',
      symbol: 'INFY',
      exchange: 'NSE',
      securityId: '123',
    });

    expect(events[0].instrumentId).toBe('inst-1');
    expect(prisma.corporateActionEvent.updateMany).toHaveBeenCalled();
  });
});
