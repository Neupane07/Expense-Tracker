import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';

export type McpAuthenticatedPrincipal = {
  user: AuthenticatedUser;
  tokenId: string;
};

export type IssuedMcpToken = {
  token: string;
  tokenId: string;
  tokenPrefix: string;
  userId: string;
};

@Injectable()
export class McpAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticateBearerToken(
    authorizationHeader: string | undefined,
  ): Promise<McpAuthenticatedPrincipal> {
    const token = this.extractBearerToken(authorizationHeader);

    if (!token) {
      throw new UnauthorizedException('MCP bearer token is required.');
    }

    const principal = await this.resolveToken(token);

    if (!principal) {
      throw new UnauthorizedException(
        'MCP bearer token is invalid or revoked.',
      );
    }

    return principal;
  }

  async issueToken(input: {
    userId: string;
    label?: string;
    expiresAt?: Date | null;
  }): Promise<IssuedMcpToken> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const tokenPrefix = token.slice(0, 8);

    const row = await this.prisma.mcpAccessToken.create({
      data: {
        userId: input.userId,
        label: input.label ?? null,
        tokenHash,
        tokenPrefix,
        expiresAt: input.expiresAt ?? null,
      },
    });

    return {
      token,
      tokenId: row.id,
      tokenPrefix,
      userId: input.userId,
    };
  }

  async revokeToken(tokenId: string, userId?: string) {
    return this.prisma.mcpAccessToken.updateMany({
      where: {
        id: tokenId,
        ...(userId ? { userId } : {}),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('base64url');
  }

  private extractBearerToken(authorizationHeader: string | undefined) {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authorizationHeader.slice('Bearer '.length).trim();
    return token.length > 0 ? token : undefined;
  }

  private async resolveToken(token: string) {
    const tokenHash = this.hashToken(token);
    const row = await this.prisma.mcpAccessToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!row || row.revokedAt) {
      return null;
    }

    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    if (!this.equalTokenHashes(row.tokenHash, tokenHash)) {
      return null;
    }

    await this.prisma.mcpAccessToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      tokenId: row.id,
      user: {
        id: row.user.id,
        email: row.user.email,
        name: row.user.name,
        avatarUrl: row.user.avatarUrl,
        role: row.user.role,
      },
    };
  }

  private equalTokenHashes(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
