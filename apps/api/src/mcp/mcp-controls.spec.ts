import { Test, TestingModule } from '@nestjs/testing';
import { ToolExecutorService } from '../internal-tools/tool-executor.service';
import { ToolRegistryService } from '../internal-tools/tool-registry.service';
import { McpToolBridgeService } from './mcp-tool-bridge.service';

const USER = {
  id: 'user-a',
  email: 'user-a@example.com',
  name: 'User A',
  avatarUrl: null,
  role: 'MEMBER' as const,
};

describe('MCP inherited executor controls', () => {
  let bridge: McpToolBridgeService;
  const registry = {
    list: jest.fn(),
    get: jest
      .fn()
      .mockReturnValue({ name: 'get_scanner_readiness', version: '1' }),
  };
  const executor = {
    execute: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpToolBridgeService,
        { provide: ToolRegistryService, useValue: registry },
        { provide: ToolExecutorService, useValue: executor },
      ],
    }).compile();

    bridge = module.get(McpToolBridgeService);
  });

  it('inherits timeout envelopes from the shared executor', async () => {
    executor.execute.mockResolvedValue({
      tool: 'get_scanner_readiness',
      version: '1',
      asOf: '2026-07-01T00:00:00.000Z',
      status: 'error',
      data: { message: 'Tool execution timed out' },
      dataQuality: { error: true },
      warnings: [],
      rejectReasons: [],
      auditId: 'audit-timeout',
      durationMs: 30_000,
    });

    const result = await bridge.executeTool(USER, 'get_scanner_readiness', {});

    expect(result.status).toBe('error');
    expect(result.data).toEqual({ message: 'Tool execution timed out' });
  });

  it('inherits result-size envelopes from the shared executor', async () => {
    executor.execute.mockResolvedValue({
      tool: 'get_scanner_readiness',
      version: '1',
      asOf: '2026-07-01T00:00:00.000Z',
      status: 'error',
      data: { message: 'Tool result exceeded size limit' },
      dataQuality: { error: true },
      warnings: [],
      rejectReasons: [],
      auditId: 'audit-size',
      durationMs: 5,
    });

    const result = await bridge.executeTool(USER, 'get_scanner_readiness', {});

    expect(result.status).toBe('error');
    expect(result.data).toEqual({ message: 'Tool result exceeded size limit' });
  });
});
