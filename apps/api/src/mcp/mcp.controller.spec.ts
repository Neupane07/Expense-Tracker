import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { McpAuthService } from './mcp-auth.service';
import { McpController } from './mcp.controller';
import { McpRateLimitService } from './mcp-rate-limit.service';
import { McpRuntimeService } from './mcp-runtime.service';

describe('McpController', () => {
  let controller: McpController;
  const runtime = {
    isEnabled: jest.fn(),
    handleHttpRequest: jest.fn(),
  };
  const auth = {
    authenticateBearerToken: jest.fn(),
  };
  const rateLimit = {
    assertWithinLimit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        { provide: McpRuntimeService, useValue: runtime },
        { provide: McpAuthService, useValue: auth },
        { provide: McpRateLimitService, useValue: rateLimit },
      ],
    }).compile();

    controller = module.get(McpController);
  });

  it('returns 503 when MCP is disabled', async () => {
    runtime.isEnabled.mockReturnValue(false);
    const { res, statusMock } = createMockResponse();

    await controller.handleMcp(
      {
        method: 'POST',
        headers: {},
        body: {},
      } as never,
      res,
    );

    expect(statusMock).toHaveBeenCalledWith(503);
  });

  it('rejects browser session cookies', async () => {
    runtime.isEnabled.mockReturnValue(true);
    auth.authenticateBearerToken.mockResolvedValue({
      tokenId: 'token-1',
      user: { id: 'user-a' },
    });
    const { res, statusMock } = createMockResponse();

    await controller.handleMcp(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret',
          cookie: 'finance_os_session=abc',
        },
        body: {},
      } as never,
      res,
    );

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(runtime.handleHttpRequest).not.toHaveBeenCalled();
  });

  it('delegates authenticated requests to the runtime transport', async () => {
    runtime.isEnabled.mockReturnValue(true);
    auth.authenticateBearerToken.mockResolvedValue({
      tokenId: 'token-1',
      user: {
        id: 'user-a',
        email: 'user-a@example.com',
        name: 'User A',
        avatarUrl: null,
        role: 'MEMBER',
      },
    });
    const { res } = createMockResponse();

    await controller.handleMcp(
      {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
        body: { jsonrpc: '2.0', id: 1, method: 'initialize' },
      } as never,
      res,
    );

    expect(rateLimit.assertWithinLimit).toHaveBeenCalledWith('token-1');
    expect(runtime.handleHttpRequest).toHaveBeenCalled();
  });
});

function createMockResponse() {
  const statusMock = jest.fn().mockReturnThis();
  const jsonMock = jest.fn();
  const res = {
    status: statusMock,
    json: jsonMock,
  } as unknown as Response;

  return { res, statusMock, jsonMock };
}
