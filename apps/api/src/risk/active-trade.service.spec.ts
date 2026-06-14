import { ActiveTradeService } from './active-trade.service';
import { PrismaService } from '../prisma/prisma.service';

function journalEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'journal-1',
    symbol: 'INFY',
    side: 'BUY',
    product: 'DELIVERY',
    status: 'ACTIVE',
    plannedEntry: { toNumber: () => 1500 },
    plannedStopLoss: { toNumber: () => 1450 },
    quantity: 10,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function deliveryPosition(overrides: Record<string, unknown> = {}) {
  return {
    tradingSymbol: 'INFY',
    productType: 'CNC',
    netQty: { toNumber: () => 10 },
    ...overrides,
  };
}

describe('ActiveTradeService', () => {
  it('reconciles journal ACTIVE entries with matching delivery positions without inferring broker-only positions', async () => {
    const prisma = {
      tradeJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          journalEntry({ id: 'journal-1' }),
          journalEntry({
            id: 'journal-2',
            symbol: 'TCS',
            plannedEntry: { toNumber: () => 3500 },
            plannedStopLoss: { toNumber: () => 3600 },
            quantity: 5,
          }),
        ]),
      },
      brokerPositionSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { asOf: new Date() } }),
        findMany: jest.fn().mockResolvedValue([
          deliveryPosition(),
          deliveryPosition({
            tradingSymbol: 'RELIANCE',
            netQty: { toNumber: () => 4 },
          }),
        ]),
      },
    };
    const service = new ActiveTradeService(prisma as unknown as PrismaService);

    const result = await service.reconcile('user-1');

    expect(result.activeSwingTradeCount).toBe(2);
    expect(result.confirmedCount).toBe(1);
    expect(result.maxLossIfActiveStopLossesHit).toBe(500);
    expect(result.inferredBrokerPositions).toEqual([
      { symbol: 'RELIANCE', quantity: 4 },
    ]);
    expect(
      result.trades.find((trade) => trade.journalEntryId === 'journal-1')
        ?.classification,
    ).toBe('confirmed');
    expect(
      result.trades.find((trade) => trade.journalEntryId === 'journal-2')
        ?.classification,
    ).toBe('incomplete');
    expect(result.warnings).toContain(
      'BROKER_POSITIONS_NOT_CONFIRMED_AS_ACTIVE_SWINGS',
    );
  });

  it('does not confirm a DELIVERY BUY plan against a short broker position', async () => {
    const prisma = {
      tradeJournalEntry: {
        findMany: jest.fn().mockResolvedValue([journalEntry()]),
      },
      brokerPositionSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { asOf: new Date() } }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            deliveryPosition({ netQty: { toNumber: () => -10 } }),
          ]),
      },
    };
    const service = new ActiveTradeService(prisma as unknown as PrismaService);

    const result = await service.reconcile('user-1');

    expect(result.confirmedCount).toBe(0);
    expect(result.trades[0]?.classification).toBe('incomplete');
    expect(result.trades[0]?.warnings).toContain(
      'BROKER_POSITION_PRODUCT_OR_SIDE_MISMATCH',
    );
  });

  it('reports intraday broker positions as product mismatch instead of unmatched', async () => {
    const prisma = {
      tradeJournalEntry: {
        findMany: jest.fn().mockResolvedValue([journalEntry()]),
      },
      brokerPositionSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { asOf: new Date() } }),
        findMany: jest.fn().mockResolvedValue([
          {
            tradingSymbol: 'INFY',
            productType: 'INTRADAY',
            netQty: { toNumber: () => 10 },
          },
        ]),
      },
    };
    const service = new ActiveTradeService(prisma as unknown as PrismaService);

    const result = await service.reconcile('user-1');

    expect(result.confirmedCount).toBe(0);
    expect(result.trades[0]?.classification).toBe('incomplete');
    expect(result.trades[0]?.warnings).toContain(
      'BROKER_POSITION_PRODUCT_OR_SIDE_MISMATCH',
    );
    expect(result.trades[0]?.warnings).not.toContain(
      'ACTIVE_JOURNAL_WITHOUT_BROKER_POSITION',
    );
    expect(result.trades[0]?.brokerPositionQty).toBe(10);
  });

  it('marks quantity mismatches as incomplete and avoids double-counting stop-loss exposure', async () => {
    const prisma = {
      tradeJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          journalEntry({ quantity: 10 }),
          journalEntry({
            id: 'journal-2',
            symbol: 'INFY',
            quantity: 8,
            createdAt: new Date('2026-06-02T00:00:00.000Z'),
          }),
        ]),
      },
      brokerPositionSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { asOf: new Date() } }),
        findMany: jest.fn().mockResolvedValue([deliveryPosition()]),
      },
    };
    const service = new ActiveTradeService(prisma as unknown as PrismaService);

    const result = await service.reconcile('user-1');

    expect(result.confirmedCount).toBe(1);
    expect(result.maxLossIfActiveStopLossesHit).toBe(500);
    expect(result.warnings).toContain('DUPLICATE_ACTIVE_JOURNAL_FOR_SYMBOL');
    expect(
      result.trades.find((trade) => trade.journalEntryId === 'journal-2')
        ?.warnings,
    ).toContain('DUPLICATE_ACTIVE_JOURNAL_ENTRY');
    expect(
      result.trades.find((trade) => trade.journalEntryId === 'journal-2')
        ?.classification,
    ).toBe('incomplete');
  });

  it('returns zero max loss when no confirmed active journal plans exist', async () => {
    const prisma = {
      tradeJournalEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      brokerPositionSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { asOf: new Date() } }),
        findMany: jest.fn().mockResolvedValue([deliveryPosition()]),
      },
    };
    const service = new ActiveTradeService(prisma as unknown as PrismaService);

    const result = await service.reconcile('user-1');

    expect(result.activeSwingTradeCount).toBe(0);
    expect(result.maxLossIfActiveStopLossesHit).toBe(0);
    expect(result.inferredBrokerPositions).toEqual([
      { symbol: 'INFY', quantity: 10 },
    ]);
  });
});
