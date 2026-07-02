import {
  All,
  Controller,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { mcpRequestContext } from './mcp-request-context';
import { McpAuthService } from './mcp-auth.service';
import { McpRateLimitService } from './mcp-rate-limit.service';
import { McpRuntimeService } from './mcp-runtime.service';

type McpRequest = Request & {
  body: unknown;
};

@Controller('mcp')
export class McpController {
  constructor(
    private readonly runtime: McpRuntimeService,
    private readonly auth: McpAuthService,
    private readonly rateLimit: McpRateLimitService,
  ) {}

  @All()
  async handleMcp(@Req() req: McpRequest, @Res() res: Response) {
    if (!this.runtime.isEnabled()) {
      res.status(503).json({ message: 'MCP adapter is disabled.' });
      return;
    }

    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.status(405).json({ message: 'Method not allowed.' });
      return;
    }

    let principal;

    try {
      principal = await this.auth.authenticateBearerToken(
        req.headers.authorization,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        res.status(401).json({ message: error.message });
        return;
      }

      throw error;
    }

    if (req.headers.cookie) {
      res.status(400).json({
        message: 'Browser session cookies are not accepted on MCP endpoints.',
      });
      return;
    }

    try {
      this.rateLimit.assertWithinLimit(principal.tokenId);
    } catch (error) {
      const status =
        typeof error === 'object' &&
        error !== null &&
        'getStatus' in error &&
        typeof (error as { getStatus: () => number }).getStatus === 'function'
          ? (error as { getStatus: () => number }).getStatus()
          : 429;
      const response =
        typeof error === 'object' &&
        error !== null &&
        'getResponse' in error &&
        typeof (error as { getResponse: () => unknown }).getResponse ===
          'function'
          ? (error as { getResponse: () => unknown }).getResponse()
          : { message: 'MCP rate limit exceeded.' };

      res.status(status).json(response);
      return;
    }

    await mcpRequestContext.run(
      { user: principal.user, tokenId: principal.tokenId },
      async () => {
        await this.runtime.handleHttpRequest(req, res, req.body);
      },
    );
  }
}
