import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_MCP_RATE_LIMIT_PER_MINUTE } from './mcp.constants';

type RateLimitBucket = {
  windowStartMs: number;
  count: number;
};

@Injectable()
export class McpRateLimitService implements OnModuleDestroy {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly limitPerMinute: number;
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(private readonly config: ConfigService) {
    const configured = Number(
      this.config.get<string>('MCP_RATE_LIMIT_PER_MINUTE') ??
        DEFAULT_MCP_RATE_LIMIT_PER_MINUTE,
    );
    this.limitPerMinute =
      Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_MCP_RATE_LIMIT_PER_MINUTE;
    this.cleanupTimer = setInterval(() => this.pruneExpiredBuckets(), 60_000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.buckets.clear();
  }

  assertWithinLimit(tokenId: string) {
    const now = Date.now();
    const bucket = this.buckets.get(tokenId);
    const windowStartMs = bucket?.windowStartMs ?? now;
    const elapsedMs = now - windowStartMs;

    if (!bucket || elapsedMs >= 60_000) {
      this.buckets.set(tokenId, { windowStartMs: now, count: 1 });
      return;
    }

    if (bucket.count >= this.limitPerMinute) {
      throw new HttpException(
        {
          message: 'MCP rate limit exceeded.',
          retryAfterSeconds: Math.ceil((60_000 - elapsedMs) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    this.buckets.set(tokenId, bucket);
  }

  private pruneExpiredBuckets() {
    const now = Date.now();

    for (const [tokenId, bucket] of this.buckets.entries()) {
      if (now - bucket.windowStartMs >= 60_000) {
        this.buckets.delete(tokenId);
      }
    }
  }
}
