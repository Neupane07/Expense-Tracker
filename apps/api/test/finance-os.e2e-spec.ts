import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { BrokerCredentialsService } from '../src/broker/broker-credentials.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TradeJournalService } from '../src/trade-journal/trade-journal.service';

const USER_A: AuthenticatedUser = {
  id: 'user-a',
  email: 'user-a@example.com',
  name: 'User A',
  role: 'MEMBER',
  avatarUrl: null,
};

const USER_B: AuthenticatedUser = {
  id: 'user-b',
  email: 'user-b@example.com',
  name: 'User B',
  role: 'MEMBER',
  avatarUrl: null,
};

type JournalListBody = {
  entries: Array<{ id: string; symbol: string }>;
};

type ReadinessBody = {
  status: string;
  universeSource: string;
  researchDisclaimer: string;
  checks: Array<{ id: string }>;
};

type ToolCatalogBody = {
  readOnly: boolean;
  tools: Array<{ name: string; version: string }>;
  forbiddenToolNames: string[];
};

function sessionCookie(userId: string) {
  return `expense_session=${userId}-session-token`;
}

function readCookieHeader(request: Request) {
  const header = request.headers.cookie;
  return typeof header === 'string' ? header : '';
}

describe('Finance OS authenticated boundaries (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    session: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    tradeJournalEntry: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    brokerConnection: {
      findUnique: jest.fn(),
    },
    brokerHoldingSnapshot: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    brokerFundSnapshot: {
      findFirst: jest.fn(),
    },
    instrument: {
      findFirst: jest.fn(),
    },
    priceSnapshot: {
      findFirst: jest.fn(),
    },
    dailyCandle: {
      findMany: jest.fn(),
    },
    technicalIndicatorSnapshot: {
      findFirst: jest.fn(),
    },
    researchItem: {
      findMany: jest.fn(),
    },
    researchSnapshot: {
      findFirst: jest.fn(),
    },
    brokerPositionSnapshot: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    portfolioSnapshot: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    toolExecutionAudit: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.session.findFirst.mockImplementation(
      ({ where }: { where: { tokenHash: string } }) => {
        const token = where.tokenHash;
        if (token === 'hash:user-a-session-token') {
          return Promise.resolve({ id: 's-a', user: USER_A });
        }
        if (token === 'hash:user-b-session-token') {
          return Promise.resolve({ id: 's-b', user: USER_B });
        }
        return Promise.resolve(null);
      },
    );
    prisma.session.update.mockResolvedValue({});
    prisma.brokerConnection.findUnique.mockResolvedValue({
      lastSyncAt: new Date('2026-06-13T08:00:00.000Z'),
    });
    prisma.brokerHoldingSnapshot.aggregate.mockResolvedValue({
      _max: { asOf: null },
    });
    prisma.brokerHoldingSnapshot.count.mockResolvedValue(0);
    prisma.brokerFundSnapshot.findFirst.mockResolvedValue(null);
    prisma.instrument.findFirst.mockResolvedValue(null);
    prisma.priceSnapshot.findFirst.mockResolvedValue(null);
    prisma.dailyCandle.findMany.mockResolvedValue([]);
    prisma.technicalIndicatorSnapshot.findFirst.mockResolvedValue(null);
    prisma.researchItem.findMany.mockResolvedValue([]);
    prisma.researchSnapshot.findFirst.mockResolvedValue(null);
    prisma.brokerPositionSnapshot.aggregate.mockResolvedValue({
      _max: { asOf: null },
    });
    prisma.brokerPositionSnapshot.findMany.mockResolvedValue([]);
    prisma.portfolioSnapshot.findFirst.mockResolvedValue(null);
    prisma.portfolioSnapshot.create.mockResolvedValue({
      id: 'snap-1',
      snapshotTime: new Date('2026-06-14T00:00:00.000Z'),
      brokerAccountId: null,
      totalStockValue: 0,
      totalEtfValue: 0,
      totalMfValue: 0,
      totalCashValue: 0,
      totalValue: 0,
      allocation: {},
      source: {},
      warnings: [],
    });
    prisma.toolExecutionAudit.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'audit-1',
        ...data,
      }),
    );
    prisma.toolExecutionAudit.updateMany.mockResolvedValue({ count: 1 });
    prisma.toolExecutionAudit.findMany.mockImplementation(
      ({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          where.userId === 'user-a'
            ? [
                {
                  id: 'audit-a',
                  userId: 'user-a',
                  toolName: 'get_scanner_readiness',
                  toolVersion: '1',
                  status: 'OK',
                  startedAt: new Date('2026-06-14T00:00:00.000Z'),
                  completedAt: new Date('2026-06-14T00:00:01.000Z'),
                  durationMs: 1000,
                  warningCount: 0,
                  rejectCount: 0,
                  errorCode: null,
                  inputHash: 'hash-a',
                  inputMeta: { keys: [] },
                  createdAt: new Date('2026-06-14T00:00:01.000Z'),
                },
              ]
            : [],
        ),
    );
    prisma.toolExecutionAudit.findFirst.mockImplementation(
      ({ where }: { where: { id: string; userId: string } }) => {
        if (where.userId === 'user-a' && where.id === 'audit-a') {
          return Promise.resolve({
            id: 'audit-a',
            userId: 'user-a',
            toolName: 'get_scanner_readiness',
            toolVersion: '1',
            status: 'OK',
            startedAt: new Date('2026-06-14T00:00:00.000Z'),
            completedAt: new Date('2026-06-14T00:00:01.000Z'),
            durationMs: 1000,
            warningCount: 0,
            rejectCount: 0,
            errorCode: null,
            inputHash: 'hash-a',
            inputMeta: { keys: [] },
            createdAt: new Date('2026-06-14T00:00:01.000Z'),
          });
        }

        return Promise.resolve(null);
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AuthService)
      .useValue({
        authenticateRequest: jest.fn((req: Request) => {
          const cookie = readCookieHeader(req);
          if (cookie.includes('user-a-session-token')) {
            return Promise.resolve(USER_A);
          }
          if (cookie.includes('user-b-session-token')) {
            return Promise.resolve(USER_B);
          }
          return Promise.resolve(null);
        }),
        hash: (value: string) => `hash:${value}`,
      })
      .overrideProvider(BrokerCredentialsService)
      .useValue({
        getDhanConnection: jest.fn().mockResolvedValue({
          connected: true,
          status: 'CONFIGURED',
          hasApiKey: true,
          hasApiSecret: true,
          hasAccessToken: true,
          clientIdMasked: '****1234',
          apiKeyMasked: '****abcd',
          accessTokenExpiresAt: null,
          lastValidatedAt: new Date('2026-06-13T08:00:00.000Z'),
          lastSyncAt: new Date('2026-06-13T08:00:00.000Z'),
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('blocks Finance OS routes without a session', async () => {
    const server = app.getHttpServer();

    await request(server).get('/broker/dhan/connection').expect(401);
    await request(server).get('/scanner/readiness').expect(401);
    await request(server).get('/risk/portfolio').expect(401);
    await request(server).get('/trade-journal/entries').expect(401);
  });

  it('redacts broker credentials from connection responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/broker/dhan/connection')
      .set('Cookie', sessionCookie('user-a'))
      .expect(200);

    expect(response.body).toMatchObject({
      connected: true,
      clientIdMasked: '****1234',
      apiKeyMasked: '****abcd',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-api-key');
    expect(JSON.stringify(response.body)).not.toContain('ciphertext');
  });

  it('scopes trade journal reads to the authenticated user', async () => {
    const journalService = app.get(TradeJournalService);
    const listSpy = jest
      .spyOn(journalService, 'listEntries')
      .mockResolvedValueOnce({
        entries: [{ id: 'entry-a', symbol: 'INFY' }],
        disclaimer: 'Journal only',
      } as never)
      .mockResolvedValueOnce({
        entries: [{ id: 'entry-b', symbol: 'TCS' }],
        disclaimer: 'Journal only',
      } as never);

    const responseA = await request(app.getHttpServer())
      .get('/trade-journal/entries')
      .set('Cookie', sessionCookie('user-a'))
      .expect(200);

    const responseB = await request(app.getHttpServer())
      .get('/trade-journal/entries')
      .set('Cookie', sessionCookie('user-b'))
      .expect(200);

    const bodyA = responseA.body as JournalListBody;
    const bodyB = responseB.body as JournalListBody;

    expect(listSpy).toHaveBeenNthCalledWith(1, 'user-a', expect.any(Object));
    expect(listSpy).toHaveBeenNthCalledWith(2, 'user-b', expect.any(Object));
    expect(bodyA.entries[0]?.id).toBe('entry-a');
    expect(bodyB.entries[0]?.id).toBe('entry-b');
  });

  it('returns scanner readiness for an authenticated user without running a scan', async () => {
    const response = await request(app.getHttpServer())
      .get('/scanner/readiness')
      .set('Cookie', sessionCookie('user-a'))
      .expect(200);

    const body = response.body as ReadinessBody;

    expect(body).toMatchObject({
      status: expect.stringMatching(/READY|DEGRADED|BLOCKED/) as string,
      universeSource: 'holdings',
      researchDisclaimer: expect.stringContaining(
        'does not run scans',
      ) as string,
    });
    expect(body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'dhan-connection' }),
        expect.objectContaining({ id: 'broker-sync' }),
      ]),
    );
  });

  it('rejects invalid scanner readiness query parameters', async () => {
    await request(app.getHttpServer())
      .get('/scanner/readiness?symbols=INFY&universe=symbols')
      .set('Cookie', sessionCookie('user-a'))
      .expect(400);
  });

  it('lists internal tool catalog for authenticated users', async () => {
    const response = await request(app.getHttpServer())
      .get('/tools')
      .set('Cookie', sessionCookie('user-a'))
      .expect(200);

    const body = response.body as ToolCatalogBody;

    expect(body.readOnly).toBe(true);
    expect(body.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'get_scanner_readiness',
          version: '1',
        }),
        expect.objectContaining({
          name: 'create_manual_super_order_plan',
          version: '1',
        }),
      ]),
    );
    expect(body.forbiddenToolNames).toContain('place_order');
  });

  it('scopes tool audit history to the authenticated user', async () => {
    const responseA = await request(app.getHttpServer())
      .get('/tools/audits')
      .set('Cookie', sessionCookie('user-a'))
      .expect(200);

    const responseB = await request(app.getHttpServer())
      .get('/tools/audits')
      .set('Cookie', sessionCookie('user-b'))
      .expect(200);

    expect(responseA.body).toHaveLength(1);
    expect(responseB.body).toEqual([]);
    expect(JSON.stringify(responseA.body)).not.toContain('apiKey');
  });

  it('executes get_scanner_readiness through the tool envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/tools/get_scanner_readiness/execute')
      .set('Cookie', sessionCookie('user-a'))
      .send({})
      .expect(201);

    expect(response.body).toMatchObject({
      tool: 'get_scanner_readiness',
      version: '1',
      status: expect.stringMatching(/ok|rejected|unavailable|error/) as string,
      auditId: 'audit-1',
      durationMs: expect.any(Number) as number,
    });
    expect(JSON.stringify(response.body)).not.toContain('apiSecret');
  });

  it('rejects forbidden broker write tool names', async () => {
    await request(app.getHttpServer())
      .post('/tools/place_order/execute')
      .set('Cookie', sessionCookie('user-a'))
      .send({})
      .expect(404);
  });
});
