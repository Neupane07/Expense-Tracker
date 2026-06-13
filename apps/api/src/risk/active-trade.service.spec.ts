import { ActiveTradeService } from './active-trade.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActiveTradeService', () => {
  it('reconciles journal ACTIVE entries with broker positions without inferring swings from broker-only positions', async () => {
    const prisma = {
      tradeJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'journal-1',
            symbol: 'INFY',
            status: 'ACTIVE',
            plannedEntry: { toNumber: () => 1500 },
            plannedStopLoss: { toNumber: () => 1450 },
            quantity: 10,
          },
          {
            id: 'journal-2',
            symbol: 'TCS',
            status: 'ACTIVE',
            plannedEntry: { toNumber: () => 3500 },
            plannedStopLoss: { toNumber: () => 3600 },
            quantity: 5,
          },
        ]),
      },
      brokerPositionSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { asOf: new Date() } }),
        findMany: jest.fn().mockResolvedValue([
          {
            tradingSymbol: 'INFY',
            netQty: { toNumber: () => 10 },
          },
          {
            tradingSymbol: 'RELIANCE',
            netQty: { toNumber: () => 4 },
          },
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
      result.trades.find((trade) => trade.symbol === 'INFY')?.classification,
    ).toBe('confirmed');
    expect(
      result.trades.find((trade) => trade.symbol === 'TCS')?.classification,
    ).toBe('incomplete');
    expect(result.warnings).toContain(
      'BROKER_POSITIONS_NOT_CONFIRMED_AS_ACTIVE_SWINGS',
    );
  });

  it('returns zero max loss when no confirmed active journal plans exist', async () => {
    const prisma = {
      tradeJournalEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      brokerPositionSnapshot: {
        aggregate: jest.fn().mockResolvedValue({ _max: { asOf: new Date() } }),
        findMany: jest.fn().mockResolvedValue([
          {
            tradingSymbol: 'INFY',
            netQty: { toNumber: () => 2 },
          },
        ]),
      },
    };
    const service = new ActiveTradeService(prisma as unknown as PrismaService);

    const result = await service.reconcile('user-1');

    expect(result.activeSwingTradeCount).toBe(0);
    expect(result.maxLossIfActiveStopLossesHit).toBe(0);
    expect(result.inferredBrokerPositions).toEqual([
      { symbol: 'INFY', quantity: 2 },
    ]);
  });
});
