import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { BrokerCredentialsService } from '../src/broker/broker-credentials.service';
import { ToolExecutorService } from '../src/internal-tools/tool-executor.service';
import { MCP_ALLOWED_TOOL_NAMES } from '../src/mcp/mcp.constants';
import { PrismaService } from '../src/prisma/prisma.service';

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

const MCP_TOKEN_A = 'mcp-token-user-a-secret-value';
const MCP_TOKEN_B = 'mcp-token-user-b-secret-value';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('base64url');
}

function bearer(token: string) {
  return `Bearer ${token}`;
}

function mcpRequest(app: INestApplication<App>, token?: string) {
  const agent = request(app.getHttpServer())
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream');

  if (token) {
    agent.set('Authorization', bearer(token));
  }

  return agent;
}

function sessionCookie(userId: string) {
  return `expense_session=${userId}-session-token`;
}

type McpJsonRpcBody = {
  result?: {
    tools?: Array<{
      name: string;
      inputSchema?: Record<string, unknown>;
    }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    content?: Array<{ type: string; text: string }>;
  };
  message?: string;
};

type ToolEnvelopeBody = {
  tool: string;
  version: string;
  status: string;
  auditId: string;
  warnings: string[];
  rejectReasons: string[];
  dataQuality: Record<string, unknown>;
};

describe('MCP read-only adapter (e2e)', () => {
  let app: INestApplication<App>;
  const originalMcpEnabled = process.env.MCP_ENABLED;
  const originalRateLimit = process.env.MCP_RATE_LIMIT_PER_MINUTE;

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    session: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    mcpAccessToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
    process.env.MCP_ENABLED = 'true';
    process.env.MCP_RATE_LIMIT_PER_MINUTE = '100';

    prisma.session = {
      findFirst: jest.fn(),
      update: jest.fn(),
    };
    prisma.session.findFirst.mockImplementation(
      ({ where }: { where: { tokenHash: string } }) => {
        if (where.tokenHash === 'hash:user-a-session-token') {
          return Promise.resolve({ id: 's-a', user: USER_A });
        }
        if (where.tokenHash === 'hash:user-b-session-token') {
          return Promise.resolve({ id: 's-b', user: USER_B });
        }
        return Promise.resolve(null);
      },
    );
    prisma.session.update.mockResolvedValue({});

    prisma.mcpAccessToken.findUnique.mockImplementation(
      ({ where }: { where: { tokenHash: string } }) => {
        if (where.tokenHash === hashToken(MCP_TOKEN_A)) {
          return Promise.resolve({
            id: 'mcp-token-a',
            revokedAt: null,
            expiresAt: null,
            tokenHash: hashToken(MCP_TOKEN_A),
            user: USER_A,
          });
        }

        if (where.tokenHash === hashToken(MCP_TOKEN_B)) {
          return Promise.resolve({
            id: 'mcp-token-b',
            revokedAt: null,
            expiresAt: null,
            tokenHash: hashToken(MCP_TOKEN_B),
            user: USER_B,
          });
        }

        return Promise.resolve(null);
      },
    );
    prisma.mcpAccessToken.update.mockResolvedValue({});
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
        id: 'audit-mcp-1',
        ...data,
      }),
    );
    prisma.toolExecutionAudit.updateMany.mockResolvedValue({ count: 1 });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AuthService)
      .useValue({
        authenticateRequest: jest.fn(
          (req: { headers: { cookie?: string } }) => {
            const cookie = req.headers.cookie ?? '';
            if (cookie.includes('user-a-session-token')) {
              return Promise.resolve(USER_A);
            }
            if (cookie.includes('user-b-session-token')) {
              return Promise.resolve(USER_B);
            }
            return Promise.resolve(null);
          },
        ),
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
    process.env.MCP_ENABLED = originalMcpEnabled;
    process.env.MCP_RATE_LIMIT_PER_MINUTE = originalRateLimit;
  });

  it('reports MCP health readiness', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/mcp')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      transport: 'streamable-http',
      exposedToolCount: MCP_ALLOWED_TOOL_NAMES.length,
    });
  });

  it('rejects MCP requests without bearer authentication', async () => {
    await mcpRequest(app)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      })
      .expect(401);
  });

  it('rejects browser session cookies on MCP endpoints', async () => {
    const response = await mcpRequest(app, MCP_TOKEN_A)
      .set('Cookie', sessionCookie('user-a'))
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      })
      .expect(400);

    expect((response.body as McpJsonRpcBody).message).toContain(
      'session cookies',
    );
  });

  it('exposes only the allowlisted tool catalog over MCP', async () => {
    await initializeMcpSession(app, MCP_TOKEN_A);

    const response = await mcpRequest(app, MCP_TOKEN_A)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      })
      .expect(200);

    const body = response.body as McpJsonRpcBody;
    const tools = body.result?.tools ?? [];
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([...MCP_ALLOWED_TOOL_NAMES].sort());
    expect(names).not.toContain('place_order');

    const portfolioTool = tools.find(
      (tool) => tool.name === 'get_portfolio_snapshot',
    );
    expect(portfolioTool?.inputSchema).toMatchObject({
      type: 'object',
      properties: {},
    });
  });

  it('accepts MCP _meta metadata for empty-input tools', async () => {
    await initializeMcpSession(app, MCP_TOKEN_A);

    const response = await mcpRequest(app, MCP_TOKEN_A)
      .send({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'get_portfolio_snapshot',
          arguments: {
            _meta: { progressToken: 'codex-test' },
          },
        },
      })
      .expect(200);

    const body = response.body as McpJsonRpcBody;
    const envelope = body.result?.structuredContent as ToolEnvelopeBody;

    expect(body.result?.isError).not.toBe(true);
    expect(envelope.tool).toBe('get_portfolio_snapshot');
    expect(envelope.status).not.toBe('rejected');
    expect(envelope.rejectReasons ?? []).not.toContain('INVALID_INPUT');
  });

  it('executes an allowlisted tool and returns the standard envelope', async () => {
    await initializeMcpSession(app, MCP_TOKEN_A);

    const response = await mcpRequest(app, MCP_TOKEN_A)
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_scanner_readiness',
          arguments: {},
        },
      })
      .expect(200);

    const structured = response.body as McpJsonRpcBody;
    const envelope = structured.result?.structuredContent as ToolEnvelopeBody;

    expect(envelope).toMatchObject({
      tool: 'get_scanner_readiness',
      version: '1',
      status: expect.stringMatching(/ok|rejected|unavailable|error/) as string,
      auditId: 'audit-mcp-1',
      warnings: expect.any(Array) as string[],
      rejectReasons: expect.any(Array) as string[],
      dataQuality: expect.any(Object) as Record<string, unknown>,
    });
    expect(JSON.stringify(response.body)).not.toContain('apiSecret');
    expect(JSON.stringify(response.body)).not.toContain(MCP_TOKEN_A);
  });

  it('returns rejected envelope semantics for invalid trade setup input', async () => {
    await initializeMcpSession(app, MCP_TOKEN_A);

    const response = await mcpRequest(app, MCP_TOKEN_A)
      .send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'validate_trade_setup',
          arguments: {
            symbol: 'INFY',
            side: 'BUY',
            entry: 100,
            target: 105,
            stopLoss: 99,
            product: 'DELIVERY',
          },
        },
      })
      .expect(200);

    const body = response.body as McpJsonRpcBody;
    const structured = body.result?.structuredContent as ToolEnvelopeBody;

    expect(structured.tool).toBe('validate_trade_setup');
    expect(structured.status).not.toBe('ok');
    expect(structured.auditId).toBeTruthy();
  });

  it('matches direct /tools execute envelope for the same user and input', async () => {
    const executor = app.get(ToolExecutorService);
    const fixedEnvelope = {
      tool: 'get_scanner_readiness',
      version: '1',
      asOf: '2026-07-01T00:00:00.000Z',
      status: 'ok' as const,
      data: { status: 'READY' },
      dataQuality: { readiness: 'READY' },
      warnings: [],
      rejectReasons: [],
      auditId: 'audit-parity-1',
      durationMs: 7,
    };
    const executeMock = jest.spyOn(executor, 'execute');
    executeMock.mockResolvedValue(fixedEnvelope);

    const mcpResponse = await callMcpTool(
      app,
      MCP_TOKEN_A,
      'get_scanner_readiness',
      {},
    );

    const httpResponse = await request(app.getHttpServer())
      .post('/tools/get_scanner_readiness/execute')
      .set('Cookie', sessionCookie('user-a'))
      .send({})
      .expect(201);

    expect(executeMock).toHaveBeenCalledTimes(2);
    for (const call of executeMock.mock.calls) {
      expect(call[0]).toMatchObject({ id: 'user-a' });
      expect(call[1]).toBe('get_scanner_readiness');
    }
    expect(mcpResponse.result.structuredContent).toEqual(fixedEnvelope);
    expect(httpResponse.body).toEqual(fixedEnvelope);
  });

  it('isolates MCP execution to the authenticated token user', async () => {
    prisma.toolExecutionAudit.create.mockImplementation(
      ({ data }: { data: { userId: string } }) =>
        Promise.resolve({
          id: `audit-${data.userId}`,
          ...data,
        }),
    );

    const responseA = await callMcpTool(
      app,
      MCP_TOKEN_A,
      'get_scanner_readiness',
      {},
    );
    const responseB = await callMcpTool(
      app,
      MCP_TOKEN_B,
      'get_scanner_readiness',
      {},
    );

    expect(responseA.result.structuredContent.auditId).toBe('audit-user-a');
    expect(responseB.result.structuredContent.auditId).toBe('audit-user-b');
  });

  it('rejects forbidden broker-write tool names over MCP', async () => {
    await initializeMcpSession(app, MCP_TOKEN_A);

    const response = await mcpRequest(app, MCP_TOKEN_A)
      .send({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'place_order',
          arguments: {},
        },
      })
      .expect(200);

    const body = response.body as McpJsonRpcBody;

    expect(body.result?.isError).toBe(true);
    expect(JSON.stringify(body.result)).toContain('place_order');
  });

  it('enforces per-token rate limits', async () => {
    process.env.MCP_RATE_LIMIT_PER_MINUTE = '2';
    await app.close();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AuthService)
      .useValue({
        authenticateRequest: jest.fn(
          (req: { headers: { cookie?: string } }) => {
            const cookie = req.headers.cookie ?? '';
            if (cookie.includes('user-a-session-token')) {
              return Promise.resolve(USER_A);
            }
            if (cookie.includes('user-b-session-token')) {
              return Promise.resolve(USER_B);
            }
            return Promise.resolve(null);
          },
        ),
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

    await initializeMcpSession(app, MCP_TOKEN_A);
    await mcpRequest(app, MCP_TOKEN_A)
      .send({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/list',
        params: {},
      })
      .expect(200);

    await mcpRequest(app, MCP_TOKEN_A)
      .send({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/list',
        params: {},
      })
      .expect(429);
  });
});

async function initializeMcpSession(app: INestApplication<App>, token: string) {
  await mcpRequest(app, token)
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    })
    .expect(200);
}

async function callMcpTool(
  app: INestApplication<App>,
  token: string,
  name: string,
  argumentsValue: Record<string, unknown>,
) {
  await initializeMcpSession(app, token);

  const response = await mcpRequest(app, token)
    .send({
      jsonrpc: '2.0',
      id: 99,
      method: 'tools/call',
      params: {
        name,
        arguments: argumentsValue,
      },
    })
    .expect(200);

  return response.body as {
    result: {
      structuredContent: Record<string, unknown>;
    };
  };
}
