import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ToolExecutorService } from '../internal-tools/tool-executor.service';
import { ToolRegistryService } from '../internal-tools/tool-registry.service';
import { MCP_ALLOWED_TOOL_NAMES } from './mcp.constants';
import { McpToolBridgeService } from './mcp-tool-bridge.service';

const USER = {
  id: 'user-a',
  email: 'user-a@example.com',
  name: 'User A',
  avatarUrl: null,
  role: 'MEMBER' as const,
};

describe('McpToolBridgeService', () => {
  let bridge: McpToolBridgeService;
  const registry = {
    list: jest.fn(),
    get: jest.fn(),
  };
  const executor = {
    execute: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    registry.list.mockReturnValue(
      MCP_ALLOWED_TOOL_NAMES.map((name) => ({
        name,
        version: '1',
        description: name,
        readOnly: true,
        inputSchema: {},
        outputSchema: {},
      })),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpToolBridgeService,
        { provide: ToolRegistryService, useValue: registry },
        { provide: ToolExecutorService, useValue: executor },
      ],
    }).compile();

    bridge = module.get(McpToolBridgeService);
  });

  it('lists only allowlisted tools', () => {
    registry.list.mockReturnValue([
      { name: 'get_portfolio_snapshot', version: '1' },
      { name: 'place_order', version: '1' },
    ]);

    expect(bridge.listExposedTools()).toEqual([
      { name: 'get_portfolio_snapshot', version: '1' },
    ]);
  });

  it('rejects forbidden broker-write tool names', () => {
    expect(() => bridge.assertToolAllowed('place_order')).toThrow(
      NotFoundException,
    );
  });

  it('rejects tools outside the allowlist', () => {
    expect(() => bridge.assertToolAllowed('get_active_trades')).toThrow(
      ForbiddenException,
    );
  });

  it('routes allowed tools through the executor', async () => {
    const envelope = {
      tool: 'get_scanner_readiness',
      version: '1',
      asOf: '2026-07-01T00:00:00.000Z',
      status: 'ok',
      data: {},
      dataQuality: {},
      warnings: [],
      rejectReasons: [],
      auditId: 'audit-1',
      durationMs: 12,
    };
    executor.execute.mockResolvedValue(envelope);

    const result = await bridge.executeTool(USER, 'get_scanner_readiness', {});

    expect(registry.get).toHaveBeenCalledWith('get_scanner_readiness');
    expect(executor.execute).toHaveBeenCalledWith(
      USER,
      'get_scanner_readiness',
      {},
    );
    expect(result).toEqual(envelope);
  });
});
