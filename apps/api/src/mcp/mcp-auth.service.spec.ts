import { UnauthorizedException } from '@nestjs/common';
import { McpAuthService } from './mcp-auth.service';

describe('McpAuthService', () => {
  let service: McpAuthService;
  const prisma = {
    mcpAccessToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new McpAuthService(prisma as never);
  });

  it('rejects missing bearer token', async () => {
    await expect(
      service.authenticateBearerToken(undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects revoked tokens', async () => {
    prisma.mcpAccessToken.findUnique.mockResolvedValue({
      id: 'token-1',
      revokedAt: new Date(),
      expiresAt: null,
      tokenHash: service.hashToken('secret-token'),
      user: {
        id: 'user-a',
        email: 'user-a@example.com',
        name: 'User A',
        avatarUrl: null,
        role: 'MEMBER',
      },
    });

    await expect(
      service.authenticateBearerToken('Bearer secret-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('maps a valid token to the owning user', async () => {
    prisma.mcpAccessToken.findUnique.mockResolvedValue({
      id: 'token-1',
      revokedAt: null,
      expiresAt: null,
      tokenHash: service.hashToken('secret-token'),
      user: {
        id: 'user-a',
        email: 'user-a@example.com',
        name: 'User A',
        avatarUrl: null,
        role: 'MEMBER',
      },
    });
    prisma.mcpAccessToken.update.mockResolvedValue({});

    const principal = await service.authenticateBearerToken(
      'Bearer secret-token',
    );

    expect(principal.user.id).toBe('user-a');
    expect(principal.tokenId).toBe('token-1');
  });
});
