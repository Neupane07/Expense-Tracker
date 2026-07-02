import { InstrumentMasterMappingService } from './instrument-master-mapping.service';
import { InstrumentMasterSyncService } from './instrument-master-sync.service';

describe('InstrumentMasterMappingService', () => {
  const masterEntry = {
    id: 'master-1',
    securityId: '1594',
    exchange: 'NSE',
    segment: 'E',
    symbol: 'INFY',
    displayName: 'Infosys',
    isin: 'INE009A01021',
    instrumentName: 'EQUITY',
    instrumentType: 'ES',
    series: 'EQ',
    lifecycleStatus: 'ACTIVE' as const,
    supersededBySymbol: null,
    supersededBySecurityId: null,
    buySellIndicator: 'A',
    source: 'DHAN_SCRIP_MASTER',
    sourceRowHash: 'hash',
    rawMetadata: {},
    firstSeenAt: new Date('2026-07-01T08:30:00.000Z'),
    lastSeenAt: new Date('2026-07-01T08:30:00.000Z'),
    createdAt: new Date('2026-07-01T08:30:00.000Z'),
    updatedAt: new Date('2026-07-01T08:30:00.000Z'),
  };

  const syncService = {
    getLatestStatus: jest.fn(),
    isMasterStale: jest.fn(),
  };

  const prisma = {
    instrumentMasterEntry: {
      findMany: jest.fn(),
    },
  };

  let service: InstrumentMasterMappingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InstrumentMasterMappingService(
      prisma as never,
      syncService as unknown as InstrumentMasterSyncService,
    );
    syncService.getLatestStatus.mockResolvedValue({
      completedAt: new Date('2026-07-01T08:30:00.000Z'),
    });
    syncService.isMasterStale.mockReturnValue(false);
  });

  it('resolves a unique active symbol from master as VERIFIED', async () => {
    prisma.instrumentMasterEntry.findMany.mockResolvedValue([masterEntry]);

    const resolution = await service.resolveSymbol('INFY');

    expect(resolution.mappingStatus).toBe('VERIFIED');
    expect(resolution.securityId).toBe('1594');
    expect(resolution.precedenceRule).toBe('symbol_exchange');
    expect(resolution.blockers).toHaveLength(0);
  });

  it('rejects ambiguous symbol matches without guessing', async () => {
    prisma.instrumentMasterEntry.findMany.mockResolvedValue([
      { ...masterEntry, id: 'a', securityId: '1' },
      { ...masterEntry, id: 'b', securityId: '2' },
    ]);

    const resolution = await service.resolveSymbol('INFY');

    expect(resolution.mappingStatus).toBe('AMBIGUOUS');
    expect(resolution.blockers).toContain('INSTRUMENT_MAPPING_AMBIGUOUS');
    expect(resolution.conflicts[0]?.code).toBe('SYMBOL_EXCHANGE_AMBIGUOUS');
  });

  it('rejects broker securityId disagreements with master', async () => {
    prisma.instrumentMasterEntry.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([masterEntry]);

    const resolution = await service.resolveSymbol('INFY', {
      securityId: '9999',
      source: 'DHAN_HOLDINGS',
    });

    expect(resolution.blockers).toContain('INSTRUMENT_MAPPING_CONFLICT');
    expect(
      resolution.conflicts.some(
        (conflict) => conflict.code === 'BROKER_SECURITY_ID_MISMATCH',
      ),
    ).toBe(true);
  });

  it('blocks inactive lifecycle states', async () => {
    prisma.instrumentMasterEntry.findMany.mockResolvedValue([
      {
        ...masterEntry,
        lifecycleStatus: 'INACTIVE' as const,
      },
    ]);

    const resolution = await service.resolveSymbol('INFY');

    expect(resolution.blockers).toContain('INSTRUMENT_INACTIVE');
    expect(resolution.mappingStatus).toBe('UNVERIFIED');
  });

  it('falls back to broker inference only when master has never synced', async () => {
    syncService.getLatestStatus.mockResolvedValue(null);

    const resolution = await service.resolveSymbol('INFY', {
      securityId: '1594',
      source: 'DHAN_HOLDINGS',
    });

    expect(resolution.mappingStatus).toBe('INFERRED');
    expect(resolution.warnings).toContain('INSTRUMENT_MASTER_NOT_SYNCED');
    expect(resolution.warnings).toContain(
      'INSTRUMENT_MAPPING_INFERRED_FROM_BROKER',
    );
  });

  it('warns when master sync is stale but still resolves verified mapping', async () => {
    syncService.isMasterStale.mockReturnValue(true);
    prisma.instrumentMasterEntry.findMany.mockResolvedValue([masterEntry]);

    const resolution = await service.resolveSymbol('INFY');

    expect(resolution.mappingStatus).toBe('VERIFIED');
    expect(resolution.masterStale).toBe(true);
    expect(resolution.warnings).toContain('INSTRUMENT_MASTER_STALE');
  });
});
