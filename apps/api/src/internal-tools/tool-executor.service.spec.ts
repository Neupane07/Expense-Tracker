import { ToolAuditService } from './tool-audit.service';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRedactionService } from './tool-redaction.service';
import { ToolRegistryService } from './tool-registry.service';
import { z } from 'zod';

describe('ToolExecutorService', () => {
  const user = {
    id: 'user-a',
    email: 'user-a@example.com',
    name: 'User A',
    role: 'MEMBER' as const,
    avatarUrl: null,
  };

  function buildExecutor(input: {
    handler: () => Promise<{
      status: 'ok' | 'rejected' | 'unavailable' | 'error';
      data: Record<string, unknown>;
      warnings?: string[];
      rejectReasons?: string[];
    }>;
    timeoutMs?: number;
    maxResultBytes?: number;
  }) {
    const registry = new ToolRegistryService();
    registry.register({
      name: 'demo_tool',
      version: '1',
      description: 'Demo',
      readOnly: true,
      inputSchema: z.object({ symbol: z.string() }).strict(),
      outputSchema: z.record(z.string(), z.unknown()),
      timeoutMs: input.timeoutMs,
      maxResultBytes: input.maxResultBytes,
      handler: input.handler,
    });

    const audit = {
      createPending: jest.fn().mockResolvedValue({
        id: 'audit-1',
        startedAt: new Date('2026-06-14T00:00:00.000Z'),
      }),
      complete: jest.fn().mockResolvedValue({ count: 1 }),
    } as unknown as ToolAuditService;

    return new ToolExecutorService(registry, audit, new ToolRedactionService());
  }

  it('validates input and returns redacted envelope', async () => {
    const executor = buildExecutor({
      handler: () =>
        Promise.resolve({
          status: 'ok' as const,
          data: { symbol: 'TCS', apiKey: 'secret', entry: 100, target: 120 },
        }),
    });

    const envelope = await executor.execute(user, 'demo_tool', {
      symbol: 'TCS',
    });

    expect(envelope.status).toBe('ok');
    expect(envelope.tool).toBe('demo_tool');
    expect(envelope.auditId).toBe('audit-1');
    expect((envelope.data as { apiKey: string }).apiKey).toBe('[REDACTED]');
    expect((envelope.data as { entry: number }).entry).toBe(100);
    expect((envelope.data as { target: number }).target).toBe(120);
  });

  it('returns rejected envelope with audit for invalid input', async () => {
    const executor = buildExecutor({
      handler: () => Promise.resolve({ status: 'ok' as const, data: {} }),
    });

    const envelope = await executor.execute(user, 'demo_tool', { bad: true });

    expect(envelope.status).toBe('rejected');
    expect(envelope.auditId).toBe('audit-1');
    expect(envelope.rejectReasons).toContain('INVALID_INPUT');
  });

  it('normalizes timeout errors', async () => {
    const executor = buildExecutor({
      timeoutMs: 5,
      handler: () =>
        new Promise<{ status: 'ok'; data: { slow: boolean } }>((resolve) => {
          setTimeout(() => resolve({ status: 'ok', data: { slow: true } }), 50);
        }),
    });

    const envelope = await executor.execute(user, 'demo_tool', {
      symbol: 'TCS',
    });

    expect(envelope.status).toBe('error');
    expect(envelope.rejectReasons).toEqual([]);
    expect(envelope.data).toMatchObject({
      message: 'Tool execution timed out',
    });
  });

  it('normalizes oversized results', async () => {
    const executor = buildExecutor({
      maxResultBytes: 50,
      handler: () =>
        Promise.resolve({
          status: 'ok' as const,
          data: { blob: 'x'.repeat(500) },
        }),
    });

    const envelope = await executor.execute(user, 'demo_tool', {
      symbol: 'TCS',
    });

    expect(envelope.status).toBe('error');
    expect(envelope.data).toMatchObject({
      message: 'Tool result exceeded size limit',
    });
  });
});
