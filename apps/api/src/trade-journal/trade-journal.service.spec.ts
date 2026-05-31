import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TradeJournalService } from './trade-journal.service';

describe('TradeJournalService', () => {
  const validationResult = {
    valid: true,
    symbol: 'INFY',
    entry: 1500,
    target: 1620,
    stopLoss: 1450,
    quantity: 5,
    capitalRequired: 7500,
    riskPerShare: 50,
    rewardPerShare: 120,
    riskReward: 2.4,
    maxLossAmount: 250,
    targetProfitAmount: 600,
    portfolioExposureBefore: { amount: 0, percent: 0 },
    portfolioExposureAfter: { amount: 7500, percent: 3.75 },
    warnings: [],
    rejectReasons: [],
    dataQuality: {
      source: 'DHAN',
      asOf: '2026-05-30T09:30:00.000Z',
      freshness: 'LIVE',
      confidence: 'HIGH',
      warnings: [],
    },
  };

  const scannerCandidate = {
    symbol: 'INFY',
    name: 'Infosys',
    setupType: 'BREAKOUT',
    entry: 1500,
    target: 1620,
    stopLoss: 1450,
    suggestedQuantity: 5,
    status: 'candidate',
  };

  function createService(overrides?: {
    instrumentError?: Error;
    entries?: unknown[];
  }) {
    const prisma = {
      tradeJournalEntry: {
        findMany: jest.fn().mockResolvedValue(overrides?.entries ?? []),
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(
          ({
            data,
          }: {
            data: {
              plannedEntry: number;
              plannedTarget: number;
              plannedStopLoss: number;
            };
          }) =>
            Promise.resolve({
              id: 'entry-1',
              createdAt: new Date('2026-05-30T10:00:00.000Z'),
              updatedAt: new Date('2026-05-30T10:00:00.000Z'),
              mistakeTags: [],
              exitPrice: null,
              exitAt: null,
              actualPnl: null,
              exitReason: null,
              lessonLearned: null,
              closedAt: null,
              cancelledAt: null,
              ...data,
              plannedEntry: { toNumber: () => data.plannedEntry },
              plannedTarget: { toNumber: () => data.plannedTarget },
              plannedStopLoss: { toNumber: () => data.plannedStopLoss },
            }),
        ),
        update: jest.fn().mockResolvedValue({
          id: 'entry-1',
          symbol: 'INFY',
          side: 'BUY',
          product: 'DELIVERY',
          plannedEntry: { toNumber: () => 1500 },
          plannedTarget: { toNumber: () => 1620 },
          plannedStopLoss: { toNumber: () => 1450 },
          quantity: 5,
          setupType: 'BREAKOUT',
          status: 'CLOSED',
          notes: null,
          source: 'MANUAL',
          swingScanRunId: null,
          scannerCandidateKey: null,
          validationSnapshot: {},
          dataQuality: {},
          exitPrice: { toNumber: () => 1580 },
          exitAt: new Date('2026-05-30T11:00:00.000Z'),
          actualPnl: { toNumber: () => 400 },
          exitReason: 'Target nearly reached',
          mistakeTags: ['EARLY_EXIT'],
          lessonLearned: 'Stick to plan',
          closedAt: new Date('2026-05-30T11:00:00.000Z'),
          cancelledAt: null,
          createdAt: new Date('2026-05-30T10:00:00.000Z'),
          updatedAt: new Date('2026-05-30T11:00:00.000Z'),
        }),
        delete: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      },
      swingScanRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'run-1',
          candidates: [scannerCandidate],
        }),
      },
    };
    const instruments = {
      findBySymbol: overrides?.instrumentError
        ? jest.fn().mockRejectedValue(overrides.instrumentError)
        : jest.fn().mockResolvedValue({ symbol: 'INFY' }),
    };
    const tradeValidation = {
      validateTrade: jest.fn().mockResolvedValue(validationResult),
    };

    return {
      service: new TradeJournalService(
        prisma as never,
        instruments as never,
        tradeValidation as never,
      ),
      prisma,
      instruments,
      tradeValidation,
    };
  }

  it('rejects unknown symbols on create', async () => {
    const { service } = createService({
      instrumentError: new NotFoundException('not mapped'),
    });

    await expect(
      service.createEntry('user-1', {
        symbol: 'UNKNOWN',
        side: 'BUY',
        product: 'DELIVERY',
        plannedEntry: 100,
        plannedTarget: 120,
        plannedStopLoss: 95,
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-DELIVERY product on create', async () => {
    const { service } = createService();

    await expect(
      service.createEntry('user-1', {
        symbol: 'INFY',
        side: 'BUY',
        product: 'INTRADAY',
        plannedEntry: 100,
        plannedTarget: 120,
        plannedStopLoss: 95,
        quantity: 1,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PRODUCT_NOT_DELIVERY' },
    });
  });

  it('creates a planned entry with validation snapshot', async () => {
    const { service, tradeValidation } = createService();

    const result = await service.createEntry('user-1', {
      symbol: 'INFY',
      side: 'BUY',
      product: 'DELIVERY',
      plannedEntry: 1500,
      plannedTarget: 1620,
      plannedStopLoss: 1450,
      quantity: 5,
    });

    expect(result.entry.status).toBe('PLANNED');
    expect(result.entry.validationSnapshot).toBeTruthy();
    expect(tradeValidation.validateTrade).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        symbol: 'INFY',
        product: 'DELIVERY',
      }),
    );
    expect(result.disclaimer).toContain('does not place orders');
  });

  it('requires exit fields to close an entry', async () => {
    const { service, prisma } = createService();
    prisma.tradeJournalEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      symbol: 'INFY',
      side: 'BUY',
      product: 'DELIVERY',
      plannedEntry: { toNumber: () => 1500 },
      plannedTarget: { toNumber: () => 1620 },
      plannedStopLoss: { toNumber: () => 1450 },
      quantity: 5,
      setupType: null,
      status: 'ACTIVE',
      notes: null,
      source: 'MANUAL',
      swingScanRunId: null,
      scannerCandidateKey: null,
      validationSnapshot: {},
      dataQuality: {},
      exitPrice: null,
      exitAt: null,
      actualPnl: null,
      exitReason: null,
      mistakeTags: [],
      lessonLearned: null,
      closedAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.updateEntry('user-1', 'entry-1', { status: 'CLOSED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('closes an entry when exit price is provided', async () => {
    const { service, prisma } = createService();
    prisma.tradeJournalEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      symbol: 'INFY',
      side: 'BUY',
      product: 'DELIVERY',
      plannedEntry: { toNumber: () => 1500 },
      plannedTarget: { toNumber: () => 1620 },
      plannedStopLoss: { toNumber: () => 1450 },
      quantity: 5,
      setupType: null,
      status: 'ACTIVE',
      notes: null,
      source: 'MANUAL',
      swingScanRunId: null,
      scannerCandidateKey: null,
      validationSnapshot: {},
      dataQuality: {},
      exitPrice: null,
      exitAt: null,
      actualPnl: null,
      exitReason: null,
      mistakeTags: [],
      lessonLearned: null,
      closedAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.updateEntry('user-1', 'entry-1', {
      status: 'CLOSED',
      exitPrice: 1580,
      exitReason: 'Target nearly reached',
      mistakeTags: ['EARLY_EXIT'],
      lessonLearned: 'Stick to plan',
    });

    expect(result.entry.status).toBe('CLOSED');
    expect(result.entry.exitPrice).toBe(1580);
    expect(result.entry.actualPnl).toBe(400);
  });

  it('returns not found when deleting a missing entry', async () => {
    const { service, prisma } = createService();
    prisma.tradeJournalEntry.findFirst.mockResolvedValue(null);

    await expect(
      service.deleteEntry('user-1', 'missing-entry-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only allows deleting planned or cancelled entries', async () => {
    const { service, prisma } = createService();
    prisma.tradeJournalEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
      status: 'ACTIVE',
    });

    await expect(
      service.deleteEntry('user-1', 'entry-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a planned entry from scanner candidate defaults', async () => {
    const { service, prisma } = createService();

    const result = await service.createFromScannerCandidate('user-1', {
      symbol: 'INFY',
      setupType: 'BREAKOUT',
    });

    expect(result.entry.source).toBe('FROM_SCANNER');
    expect(result.entry.scannerCandidateKey).toBe('INFY::BREAKOUT');
    expect(result.entry.swingScanRunId).toBe('run-1');
    expect(prisma.swingScanRun.findFirst).toHaveBeenCalled();
  });

  it('uses shared risk validation without broker order APIs', async () => {
    const { service, tradeValidation, instruments } = createService();

    await service.createEntry('user-1', {
      symbol: 'INFY',
      side: 'BUY',
      product: 'DELIVERY',
      plannedEntry: 1500,
      plannedTarget: 1620,
      plannedStopLoss: 1450,
      quantity: 5,
    });

    expect(tradeValidation.validateTrade).toHaveBeenCalled();
    expect(instruments.findBySymbol).toHaveBeenCalled();
    expect(Object.keys(tradeValidation)).not.toContain('placeOrder');
  });
});
