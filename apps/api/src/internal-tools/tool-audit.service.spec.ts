import { ToolAuditService } from './tool-audit.service';
import { ToolRedactionService } from './tool-redaction.service';

describe('ToolAuditService', () => {
  it('persists metadata without raw secrets in inputMeta', async () => {
    let persistedInputMeta: unknown;

    const prisma = {
      toolExecutionAudit: {
        create: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: { inputMeta: unknown; userId: string } }) => {
              persistedInputMeta = data.inputMeta;
              return Promise.resolve({
                id: 'audit-1',
                startedAt: new Date('2026-06-14T00:00:00.000Z'),
              });
            },
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-1',
            toolName: 'validate_trade_setup',
            toolVersion: '1',
            status: 'REJECTED',
            startedAt: new Date('2026-06-14T00:00:00.000Z'),
            completedAt: new Date('2026-06-14T00:00:01.000Z'),
            durationMs: 1000,
            warningCount: 0,
            rejectCount: 1,
            errorCode: null,
            inputHash: 'hash',
            inputMeta: { keys: ['symbol'], preview: { apiKey: '[REDACTED]' } },
            createdAt: new Date('2026-06-14T00:00:01.000Z'),
          },
        ]),
      },
    };

    const service = new ToolAuditService(
      prisma as never,
      new ToolRedactionService(),
    );

    await service.createPending({
      userId: 'user-a',
      toolName: 'validate_trade_setup',
      toolVersion: '1',
      input: { symbol: 'TCS', apiKey: 'secret' },
    });

    expect(JSON.stringify(persistedInputMeta)).not.toContain('secret');
    const meta = persistedInputMeta as {
      keys?: string[];
      fieldTypes?: Record<string, string>;
    };
    expect(meta.keys).toEqual(expect.arrayContaining(['symbol', 'apiKey']));
    expect(meta.fieldTypes).toMatchObject({
      symbol: 'string',
      apiKey: 'redacted',
    });

    const listed = await service.listForUser('user-a');
    expect(JSON.stringify(listed)).not.toContain('secret');
    expect(listed[0]?.toolName).toBe('validate_trade_setup');
  });
});
