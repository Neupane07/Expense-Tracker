import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpRateLimitService } from './mcp-rate-limit.service';

describe('McpRateLimitService', () => {
  it('allows requests within the configured limit', () => {
    const service = new McpRateLimitService({
      get: () => '3',
    } as unknown as ConfigService);

    expect(() => service.assertWithinLimit('token-a')).not.toThrow();
    expect(() => service.assertWithinLimit('token-a')).not.toThrow();
    expect(() => service.assertWithinLimit('token-a')).not.toThrow();
  });

  it('rejects requests above the configured limit', () => {
    const service = new McpRateLimitService({
      get: () => '2',
    } as unknown as ConfigService);

    service.assertWithinLimit('token-a');
    service.assertWithinLimit('token-a');

    expect(() => service.assertWithinLimit('token-a')).toThrow(HttpException);
  });

  it('tracks limits per token independently', () => {
    const service = new McpRateLimitService({
      get: () => '1',
    } as unknown as ConfigService);

    service.assertWithinLimit('token-a');

    expect(() => service.assertWithinLimit('token-a')).toThrow(HttpException);
    expect(() => service.assertWithinLimit('token-b')).not.toThrow();
  });
});
