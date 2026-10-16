import { ConfigService } from '@nestjs/config';
import { GmailService } from './gmail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SourceDocumentsService } from './source-documents.service';
import { ExpenseCryptoService } from '../expense-core/expense-crypto.service';
const config = new ConfigService({
  EXPENSE_GMAIL_ENABLED: 'true',
  EXPENSE_GMAIL_PILOT_ONLY: 'true',
  INITIAL_ADMIN_EMAIL: 'pilot@example.test',
  EXPENSE_TOKEN_KEY: '22'.repeat(32),
  EXPENSE_DATA_KEY: '11'.repeat(32),
  EXPENSE_GOOGLE_CLIENT_ID: 'client',
  EXPENSE_GOOGLE_CLIENT_SECRET: 'secret',
  EXPENSE_GOOGLE_CALLBACK_URL: 'http://localhost/email-connections/callback',
});
describe('Gmail security and backfill', () => {
  const crypto = new ExpenseCryptoService(config);
  afterEach(() => jest.restoreAllMocks());
  it('binds offline read-only consent to a user and saves only an encrypted verifier and hashed state', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 'pilot@example.test' }),
      },
      emailOAuthState: { create },
    };
    const service = new GmailService(
      prisma as unknown as PrismaService,
      config,
      crypto,
      {} as SourceDocumentsService,
    );
    const result = await service.start('u');
    const url = new URL(result.url);
    expect(url.searchParams.get('scope')).toContain('gmail.readonly');
    expect(url.searchParams.get('scope')).not.toContain('gmail.modify');
    expect(url.searchParams.get('access_type')).toBe('offline');
    const saved = (
      create.mock.calls as unknown as Array<
        [
          {
            data: { id: string; userId: string; verifier: string };
          },
        ]
      >
    )[0][0].data;
    expect(saved.userId).toBe('u');
    expect(saved.id).not.toBe(url.searchParams.get('state'));
    expect(saved.verifier).toMatch(/^v1\./);
  });
  it('rejects an OAuth callback for a different user before exchanging credentials', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    const tx = {
      emailOAuthState: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const db = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 'pilot@example.test' }),
      },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    await expect(
      new GmailService(
        db as unknown as PrismaService,
        config,
        crypto,
        {} as SourceDocumentsService,
      ).callback('other', 'code', 'state'),
    ).rejects.toThrow('invalid OAuth state');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('queues resumable month chunks for a requested historical window', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 3 });
    const db = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 'pilot@example.test' }),
      },
      emailConnection: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'c', status: 'PREVIEW', generation: 4 }),
      },
      expenseJob: { createMany },
    };
    const result = await new GmailService(
      db as unknown as PrismaService,
      config,
      crypto,
      {} as SourceDocumentsService,
    ).backfill('u', 'c', { from: '2020-01-15', to: '2020-03-10' });
    expect(result.queuedMonths).toBe(3);
    const data = (
      createMany.mock.calls as unknown as Array<
        [
          {
            data: { from: Date; to: Date; generation: number }[];
          },
        ]
      >
    )[0][0].data;
    expect(data[0].from.toISOString()).toBe('2020-03-01T00:00:00.000Z');
    expect(data[2].generation).toBe(4);
  });
  it('does not expose credentials when listing connections', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { emailConnection: { findMany } };
    await new GmailService(
      db as unknown as PrismaService,
      config,
      crypto,
      {} as SourceDocumentsService,
    ).list('u');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u' },
        omit: { refreshToken: true, googleSubject: true },
      }),
    );
  });
});
