import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResearchIngestionService } from './research-ingestion.service';
import { ResearchItemsService } from './research-items.service';
import { ResearchQualityService } from './research-quality.service';
import { ResearchSnapshotService } from './research-snapshot.service';

describe('ResearchQualityService', () => {
  const quality = new ResearchQualityService();

  it('marks evidence stale beyond threshold', () => {
    const old = new Date('2020-01-01T00:00:00.000Z');

    expect(
      quality.isEvidenceFresh(old, new Date('2026-06-01T00:00:00.000Z')),
    ).toBe(false);
  });

  it('warns when no evidence exists', () => {
    const warnings = quality.buildSnapshotWarnings({
      itemCount: 0,
      latestEvidenceAt: null,
      hasFreshEvidence: false,
      staleReason: null,
      items: [],
    });

    expect(warnings).toContain('RESEARCH_EVIDENCE_MISSING');
  });

  it('warns when evidence is stale', () => {
    const warnings = quality.buildSnapshotWarnings({
      itemCount: 1,
      latestEvidenceAt: new Date('2020-01-01T00:00:00.000Z'),
      hasFreshEvidence: false,
      staleReason: 'EVIDENCE_OLDER_THAN_THRESHOLD',
      items: [{ sourceType: 'MANUAL' }],
    });

    expect(warnings).toContain('STALE_RESEARCH_EVIDENCE');
  });
});

describe('ResearchItemsService', () => {
  function createItemsService(prisma: object) {
    return new ResearchItemsService(
      prisma as never,
      new ResearchQualityService(),
    );
  }

  it('creates and lists research items by symbol', async () => {
    type StoredItem = {
      id: string;
      userId: string;
      instrumentId: string | null;
      symbol: string;
      title: string;
      summary: string;
      category: string;
      impact: string;
      sourceType: string;
      sourceName: string;
      sourceUrl: string | null;
      publishedAt: Date | null;
      fetchedAt: Date;
      asOf: Date;
      confidence: { toNumber: () => number };
      evidence: [];
      createdAt: Date;
      updatedAt: Date;
    };

    const rows: StoredItem[] = [];
    const prisma = {
      researchItem: {
        create: jest.fn(
          ({
            data,
            include,
          }: {
            data: {
              userId: string;
              instrumentId: string | null;
              symbol: string;
              title: string;
              summary: string;
              category: string;
              impact: string;
              sourceType: string;
              sourceName: string;
              sourceUrl: string | null;
              publishedAt: Date | null;
              fetchedAt: Date;
              asOf: Date;
            };
            include?: { evidence: boolean };
          }) => {
            const item: StoredItem = {
              id: 'item-1',
              userId: data.userId,
              instrumentId: data.instrumentId,
              symbol: data.symbol,
              title: data.title,
              summary: data.summary,
              category: data.category,
              impact: data.impact,
              sourceType: data.sourceType,
              sourceName: data.sourceName,
              sourceUrl: data.sourceUrl,
              publishedAt: data.publishedAt,
              fetchedAt: data.fetchedAt,
              asOf: data.asOf,
              confidence: { toNumber: () => 0.85 },
              evidence: [],
              createdAt: new Date('2026-06-01T10:00:00.000Z'),
              updatedAt: new Date('2026-06-01T10:00:00.000Z'),
            };
            rows.push(item);

            return Promise.resolve(
              include?.evidence ? { ...item, evidence: [] } : item,
            );
          },
        ),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };

    const service = createItemsService(prisma);
    const created = await service.createItem('user-1', {
      symbol: 'INFY',
      title: 'Q4 results beat',
      summary: 'Revenue grew 12% YoY per company filing.',
      category: 'RESULT',
      impact: 'POSITIVE',
      sourceType: 'MANUAL',
      sourceName: 'User note',
      sourceUrl: 'https://example.com/results',
      publishedAt: '2026-05-28T00:00:00.000Z',
    });

    expect(created.symbol).toBe('INFY');
    const listed = await service.listItems('user-1', { symbol: 'INFY' });
    expect(listed.items).toHaveLength(1);
  });

  it('rejects deleting another users item', async () => {
    const prisma = {
      researchItem: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = createItemsService(prisma);

    await expect(
      service.deleteItem('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ResearchSnapshotService', () => {
  function createSnapshotService(overrides?: { rows?: unknown[] }) {
    const rows = overrides?.rows ?? [];
    const prisma = {
      researchItem: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
      researchSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'snap-1',
            createdAt: new Date('2026-06-01T11:00:00.000Z'),
            ...data,
          }),
        ),
      },
    };
    const items = {
      listItemsForSymbol: jest.fn().mockResolvedValue({ items: [] }),
      serializeItem: jest.fn(),
    } as unknown as ResearchItemsService;

    return {
      service: new ResearchSnapshotService(
        prisma as never,
        new ResearchQualityService(),
        items,
      ),
      prisma,
    };
  }

  it('generates deterministic snapshot summary from stored items', async () => {
    const recent = new Date('2026-05-28T00:00:00.000Z');
    const { service } = createSnapshotService({
      rows: [
        {
          id: 'item-1',
          userId: 'user-1',
          instrumentId: null,
          symbol: 'INFY',
          title: 'Strong order book',
          summary: 'Management guided higher growth.',
          category: 'MANAGEMENT_COMMENTARY',
          impact: 'POSITIVE',
          sourceType: 'MANUAL',
          sourceName: 'User',
          sourceUrl: 'https://example.com/note',
          publishedAt: recent,
          fetchedAt: recent,
          asOf: recent,
          evidence: [],
        },
      ],
    });

    const result = await service.regenerateSnapshot('user-1', 'INFY');

    expect(result.snapshot.summary).toContain('Strong order book');
    expect(result.snapshot.positiveCount).toBe(1);
    expect(result.dataQuality.status).toBe('user-provided');
  });

  it('returns missing evidence warnings for scanner integration', async () => {
    const { service } = createSnapshotService({ rows: [] });
    const status = await service.getScannerResearchStatus('user-1', 'INFY');

    expect(status.researchFreshness).toBe('missing');
    expect(status.researchWarnings).toContain('RESEARCH_EVIDENCE_MISSING');
    expect(status.hasFreshNewsOrFiling).toBe(false);
  });

  it('does not treat fetchedAt alone as fresh evidence', async () => {
    const today = new Date('2026-06-02T10:00:00.000Z');
    const { service } = createSnapshotService({
      rows: [
        {
          id: 'item-1',
          userId: 'user-1',
          instrumentId: null,
          symbol: 'INFY',
          title: 'Undated note',
          summary: 'Entered today without published date.',
          category: 'USER_NOTE',
          impact: 'NEUTRAL',
          sourceType: 'MANUAL',
          sourceName: 'User',
          sourceUrl: null,
          publishedAt: null,
          fetchedAt: today,
          asOf: today,
          evidence: [],
        },
      ],
    });

    const status = await service.getScannerResearchStatus('user-1', 'INFY');

    expect(status.researchFreshness).toBe('stale');
    expect(status.hasFreshNewsOrFiling).toBe(false);
    expect(status.researchWarnings).toContain('RESEARCH_EVIDENCE_MISSING_DATE');
  });

  it('flags stale research for scanner integration', async () => {
    const old = new Date('2020-01-01T00:00:00.000Z');
    const { service } = createSnapshotService({
      rows: [
        {
          id: 'item-1',
          userId: 'user-1',
          instrumentId: null,
          symbol: 'INFY',
          title: 'Old filing',
          summary: 'Stored note from prior cycle.',
          category: 'REGULATORY',
          impact: 'NEUTRAL',
          sourceType: 'MANUAL',
          sourceName: 'User',
          sourceUrl: null,
          publishedAt: old,
          fetchedAt: old,
          asOf: old,
          evidence: [],
        },
      ],
    });

    const status = await service.getScannerResearchStatus('user-1', 'INFY');

    expect(status.researchFreshness).toBe('stale');
    expect(status.hasStaleResearch).toBe(true);
    expect(status.researchWarnings).toContain('STALE_RESEARCH_EVIDENCE');
  });
});

describe('ResearchIngestionService', () => {
  it('rejects automated provider source types with 400', async () => {
    const service = new ResearchIngestionService(
      { createItem: jest.fn() } as never,
      { regenerateSnapshot: jest.fn() } as never,
      { findBySymbol: jest.fn() } as never,
      {
        providerId: 'manual',
        canHandle: () => false,
        prepareItem: jest.fn(),
      } as never,
      {
        providerId: 'official',
        canHandle: () => true,
        prepareItem: jest.fn(),
      } as never,
      {
        providerId: 'news',
        canHandle: () => false,
        prepareItem: jest.fn(),
      } as never,
    );

    await expect(
      service.createUserResearchItem('user-1', {
        symbol: 'INFY',
        title: 'Filing',
        summary: 'Summary',
        category: 'REGULATORY',
        impact: 'NEUTRAL',
        sourceType: 'OFFICIAL_FILING',
        sourceName: 'NSE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates manual research through manual provider', async () => {
    const items = {
      createItem: jest.fn().mockResolvedValue({ id: 'item-1', symbol: 'INFY' }),
    };
    const snapshots = {
      regenerateSnapshot: jest.fn().mockResolvedValue({ snapshot: {} }),
    };
    const instruments = {
      findBySymbol: jest.fn().mockRejectedValue(new NotFoundException()),
    };
    const manual = {
      providerId: 'manual',
      canHandle: () => true,
      prepareItem: jest.fn().mockReturnValue({
        title: 'Note',
        summary: 'Summary',
        sourceType: 'MANUAL',
        sourceName: 'User',
        fetchedAt: new Date(),
        confidence: 0.85,
      }),
    };
    const official = {
      providerId: 'official',
      canHandle: () => false,
      prepareItem: jest.fn(),
    };
    const news = {
      providerId: 'news',
      canHandle: () => false,
      prepareItem: jest.fn(),
    };

    const service = new ResearchIngestionService(
      items as never,
      snapshots as never,
      instruments as never,
      manual as never,
      official as never,
      news as never,
    );

    await service.addManualNote('user-1', {
      symbol: 'INFY',
      title: 'Note',
      summary: 'Summary',
      category: 'USER_NOTE',
      impact: 'NEUTRAL',
      sourceType: 'MANUAL',
      sourceName: 'User',
    });

    expect(items.createItem).toHaveBeenCalled();
    expect(snapshots.regenerateSnapshot).toHaveBeenCalledWith(
      'user-1',
      'INFY',
      null,
    );
  });
});
