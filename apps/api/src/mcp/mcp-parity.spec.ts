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

describe('MCP registry parity', () => {
  let bridge: McpToolBridgeService;
  let executor: ToolExecutorService;
  const registry = {
    list: jest.fn(),
    get: jest
      .fn()
      .mockReturnValue({ name: 'validate_trade_setup', version: '1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        McpToolBridgeService,
        { provide: ToolRegistryService, useValue: registry },
        {
          provide: ToolExecutorService,
          useValue: {
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    bridge = module.get(McpToolBridgeService);
    executor = module.get(ToolExecutorService);
  });

  it('uses the same executor entry point as /tools', async () => {
    const envelope = {
      tool: 'validate_trade_setup',
      version: '1',
      asOf: '2026-07-01T00:00:00.000Z',
      status: 'rejected' as const,
      data: {},
      dataQuality: {},
      warnings: [],
      rejectReasons: ['INVALID_INPUT'],
      auditId: 'audit-1',
      durationMs: 3,
    };

    const executeMock = jest.spyOn(executor, 'execute');
    executeMock.mockResolvedValue(envelope);

    const input = { symbol: 'INFY' };
    const result = await bridge.executeTool(
      USER,
      'validate_trade_setup',
      input,
    );

    expect(executeMock).toHaveBeenCalledWith(
      USER,
      'validate_trade_setup',
      input,
    );
    expect(result).toEqual(envelope);
  });
});
