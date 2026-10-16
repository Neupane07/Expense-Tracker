/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers and transaction mocks */
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Client } from 'pg';
import { join } from 'node:path';
import { GmailService } from '../src/email-capture/gmail.service';
import { ExpenseJobsService } from '../src/email-capture/expense-jobs.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ExpenseCryptoService } from '../src/expense-core/expense-crypto.service';
import { SourceDocumentsService } from '../src/email-capture/source-documents.service';
import { AccountsService } from '../src/accounts/accounts.service';
import { ReviewService } from '../src/review/review.service';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { TransactionsService } from '../src/transactions/transactions.service';

const url = process.env.EXPENSE_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('expense ingestion against isolated PostgreSQL', () => {
  let db: PrismaService,
    documents: SourceDocumentsService,
    accounts: AccountsService,
    review: ReviewService;
  let userId: string, otherId: string, cardId: string;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('/expense_email_test'))
      throw new Error('Use a disposable expense_email_test database');
    const config = new ConfigService({
      DATABASE_URL: url,
      EXPENSE_DATA_KEY: '11'.repeat(32),
      EXPENSE_TOKEN_KEY: '22'.repeat(32),
      EXPENSE_VALIDATED_TEMPLATES: 'icici-alert-v1',
    });
    db = new PrismaService(config);
    await db.$connect();
    documents = new SourceDocumentsService(
      db,
      new ExpenseCryptoService(config),
      config,
    );
    accounts = new AccountsService(db);
    review = new ReviewService(db);
    userId = (
      await db.user.create({
        data: { email: `expense-${randomUUID()}@example.test` },
      })
    ).id;
    otherId = (
      await db.user.create({
        data: { email: `expense-${randomUUID()}@example.test` },
      })
    ).id;
    cardId = (
      await accounts.create(userId, {
        name: 'Test Amazon card',
        institution: 'ICICI',
        type: 'CREDIT_CARD',
      })
    ).id;
    await accounts.addIdentifier(userId, cardId, {
      value: '1234',
      sourceType: 'ICICI_AMAZON_PAY_CARD',
    });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  const alert = (
    key: string,
    description = 'GROCERY MART',
    reference = 'SAFE12345',
  ) =>
    documents.ingest({
      userId,
      sourceKey: key,
      bytes: Buffer.from(
        JSON.stringify({
          text: `Your ICICI Bank credit card ending 1234 was used for INR 1,200.00 at ${description} on 01/10/2026. Ref: ${reference}`,
        }),
      ),
      kind: 'ALERT',
      fileName: 'alert.json',
      mimeType: 'application/json',
      metadata: {},
    });
  it('posts a mapped alert once, keeps encrypted evidence and rejects another user', async () => {
    const key = `test:${randomUUID()}`;
    const id = await alert(key);
    await alert(key);
    const detail = await documents.detail(userId, id);
    expect(detail.status).toBe('POSTED');
    expect(detail.observations).toHaveLength(1);
    expect(detail.observations[0].transactionId).toBeTruthy();
    expect(await db.transaction.count({ where: { userId } })).toBe(1);
    expect((await documents.raw(userId, id)).bytes.toString()).toContain(
      'GROCERY MART',
    );
    await expect(documents.detail(otherId, id)).rejects.toThrow(
      'Document not found',
    );
  });
  it('matches a later statement to the alert without changing manual categorization', async () => {
    const first = await db.transaction.findFirstOrThrow({ where: { userId } });
    const preview = await review.preview(userId, { ids: [first.id] });
    await review.apply(userId, {
      ids: [first.id],
      revisions: preview.revisions,
      category: {
        vendor: 'Grocery Mart',
        category: 'Groceries',
        expenseType: 'EXPENSE',
      },
      remember: true,
    });
    const id = await documents.ingest({
      userId,
      accountId: cardId,
      sourceKey: `upload:${randomUUID()}`,
      kind: 'UPLOAD',
      fileName: 'statement.csv',
      mimeType: 'text/csv',
      metadata: { sourceType: 'ICICI_AMAZON_PAY_CARD' },
      bytes: Buffer.from(
        'Transaction Date,Details,Amount,Reference Number\n01/10/2026,GROCERY MART,1200.00 Dr.,SAFE12345',
      ),
    });
    expect(
      (await documents.detail(userId, id)).observations[0].transactionId,
    ).toBe(first.id);
    const posted = await db.transaction.findUniqueOrThrow({
      where: { id: first.id },
      include: { category: true },
    });
    expect(posted.confirmation).toBe('POSTED');
    expect(posted.category?.category).toBe('Groceries');
    expect(posted.category?.isManual).toBe(true);
    expect(await db.transaction.count({ where: { userId } })).toBe(1);
  });
  it('learns the category for future purchases and preserves later decisions during undo', async () => {
    const id = await alert(`test:${randomUUID()}`, 'GROCERY MART', 'SAFE67890');
    const transactionId = (await documents.detail(userId, id)).observations[0]
      .transactionId!;
    const row = await db.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: { category: true },
    });
    expect(row.category?.category).toBe('Groceries');
    expect(row.reviewStatus).toBe('AUTO_ACCEPTED');
    const p1 = await review.preview(userId, { ids: [row.id] });
    const batch = await review.apply(userId, {
      ids: [row.id],
      revisions: p1.revisions,
      category: { vendor: 'Shop', category: 'Food', expenseType: 'EXPENSE' },
    });
    const p2 = await review.preview(userId, { ids: [row.id] });
    await review.apply(userId, {
      ids: [row.id],
      revisions: p2.revisions,
      overwriteManual: true,
      category: {
        vendor: 'Shop',
        category: 'Personal',
        expenseType: 'EXPENSE',
      },
    });
    expect((await review.undo(userId, batch.batchId)).conflicts).toEqual([
      row.id,
    ]);
    expect(
      (
        await db.transactionCategory.findUniqueOrThrow({
          where: { transactionId: row.id },
        })
      ).category,
    ).toBe('Personal');
    await expect(
      review.apply(userId, {
        ids: [row.id],
        revisions: p1.revisions,
        category: { vendor: 'Shop', category: 'Stale', expenseType: 'EXPENSE' },
      }),
    ).rejects.toThrow('Preview again');
  });
  it('keeps equal-value purchases as distinct statement rows and flags uncertain cross-source matches', async () => {
    const id = await documents.ingest({
      userId,
      accountId: cardId,
      sourceKey: `upload:${randomUUID()}`,
      kind: 'UPLOAD',
      fileName: 'repeated.csv',
      mimeType: 'text/csv',
      metadata: { sourceType: 'ICICI_AMAZON_PAY_CARD' },
      bytes: Buffer.from(
        'Transaction Date,Details,Amount,Reference Number\n02/10/2026,COFFEE SHOP,10.00 Dr.,\n02/10/2026,COFFEE SHOP,10.00 Dr.,',
      ),
    });
    const doc = await documents.detail(userId, id);
    expect(new Set(doc.observations.map((o) => o.transactionId)).size).toBe(2);
    expect(doc.observations.every((o) => o.transactionId)).toBe(true);
    const ambiguous = await documents.ingest({
      userId,
      sourceKey: `ambiguous:${randomUUID()}`,
      kind: 'ALERT',
      fileName: 'alert.json',
      mimeType: 'application/json',
      metadata: {},
      bytes: Buffer.from(
        JSON.stringify({
          text: 'Your ICICI Bank credit card ending 1234 was used for INR 10.00 at COFFEE SHOP on 02/10/2026.',
        }),
      ),
    });
    expect((await documents.detail(userId, ambiguous)).status).toBe(
      'NEEDS_MATCH',
    );
  });
  it('retains historical totals after closure and archive and shows unverified coverage', async () => {
    const reports = new DashboardService(db);
    const before = await reports.getSummary(userId, {
      from: '2020-01-01',
      to: '2026-12-31',
      accountId: cardId,
    });
    await accounts.update(userId, cardId, {
      closedAt: '2026-10-03',
      archived: true,
    });
    expect(
      await reports.getSummary(userId, {
        from: '2020-01-01',
        to: '2026-12-31',
        accountId: cardId,
      }),
    ).toEqual(before);
    expect(
      (
        await accounts.coverage(userId, cardId, {
          from: '2026-09-01',
          to: '2026-10-31',
        })
      ).months[0].status,
    ).toBe('MISSING');
    const result = await new TransactionsService(db).findAll(userId, {
      accountId: cardId,
      limit: '1',
    });
    expect(result).toMatchObject({
      items: expect.any(Array),
      nextCursor: expect.any(String),
    });
  });
  it('deletes evidence and suppresses re-ingestion without deleting financial records', async () => {
    const sourceKey = `delete:${randomUUID()}`;
    const id = await alert(sourceKey, 'BOOK SHOP', 'SAFE99999');
    const before = await db.transaction.count({ where: { userId } });
    await documents.remove(userId, id);
    await alert(sourceKey, 'BOOK SHOP', 'SAFE99999');
    expect((await documents.detail(userId, id)).status).toBe('DELETED');
    await expect(documents.raw(userId, id)).rejects.toThrow(
      'Source unavailable',
    );
    expect(await db.transaction.count({ where: { userId } })).toBe(before);
  });
  it('keeps replacement identifiers on the same closed account and rejects other-user mapping', async () => {
    await accounts.addIdentifier(userId, cardId, {
      value: '5678',
      sourceType: 'ICICI_AMAZON_PAY_CARD',
      validFrom: '2026-10-01',
    });
    const id = await documents.ingest({
      userId,
      sourceKey: `replacement:${randomUUID()}`,
      bytes: Buffer.from(
        JSON.stringify({
          text: 'Your ICICI Bank credit card ending 5678 was used for INR 15.00 at NEW SHOP on 03/10/2026. Ref: REPLACE123',
        }),
      ),
      kind: 'ALERT',
      fileName: 'alert.json',
      mimeType: 'application/json',
      metadata: {},
    });
    expect((await documents.detail(userId, id)).accountId).toBe(cardId);
    await expect(
      documents.map(otherId, id, { accountId: cardId }),
    ).rejects.toThrow('Account not found');
    await expect(
      documents.map(userId, id, { accountId: cardId }),
    ).rejects.toThrow('Cannot remap');
  });
  it('holds unvalidated templates, handles one-time and remembered PDF passwords, and posts idempotently', async () => {
    const config = new ConfigService({
      EXPENSE_DATA_KEY: '11'.repeat(32),
      EXPENSE_TOKEN_KEY: '22'.repeat(32),
    });
    const guarded = new SourceDocumentsService(
      db,
      new ExpenseCryptoService(config),
      config,
    );
    const id = await guarded.ingest({
      userId,
      accountId: cardId,
      sourceKey: `pdf:${randomUUID()}`,
      kind: 'STATEMENT',
      fileName: 'protected.pdf',
      mimeType: 'application/pdf',
      metadata: {},
      bytes: await readFile(
        join(
          __dirname,
          '../src/email-capture/fixtures/synthetic-protected-statement.pdf',
        ),
      ),
    });
    expect((await guarded.detail(userId, id)).status).toBe('PASSWORD_REQUIRED');
    expect(
      (await guarded.password(userId, id, { password: 'wrong' })).status,
    ).toBe('PASSWORD_REQUIRED');
    expect(
      (
        await guarded.password(userId, id, {
          password: 'synthetic-test-password',
        })
      ).status,
    ).toBe('NEEDS_TEMPLATE_REVIEW');
    expect(
      (await db.account.findUniqueOrThrow({ where: { id: cardId } }))
        .statementPassword,
    ).toBeNull();
    await guarded.password(userId, id, {
      password: 'synthetic-test-password',
      remember: true,
    });
    expect(
      (await db.account.findUniqueOrThrow({ where: { id: cardId } }))
        .statementPassword,
    ).toMatch(/^v1\./);
    const before = await db.transaction.count({ where: { userId } });
    await guarded.post(userId, id, true);
    expect(await db.transaction.count({ where: { userId } })).toBe(before);
    await Promise.all([guarded.post(userId, id), guarded.post(userId, id)]);
    const posted = await guarded.detail(userId, id);
    expect(posted.observations.every((o) => o.transactionId)).toBe(true);
    expect(posted.coverageStatus).toBe('UNVERIFIED');
  });
  it('uses the latest remembered decision and reports a later rule edit during undo', async () => {
    const docId = await alert(
      `learn:${randomUUID()}`,
      'GROCERY MART',
      'NEWLEARN123',
    );
    const id = (await documents.detail(userId, docId)).observations[0]
      .transactionId!;
    const p = await review.preview(userId, { ids: [id] });
    const batch = await review.apply(userId, {
      ids: [id],
      revisions: p.revisions,
      remember: true,
      category: {
        vendor: 'Grocery Mart',
        category: 'Household',
        expenseType: 'EXPENSE',
        notes: 'Weekly shop',
      },
    });
    const next = await alert(
      `learn:${randomUUID()}`,
      'GROCERY MART',
      'NEWLEARN456',
    );
    const nextId = (await documents.detail(userId, next)).observations[0]
      .transactionId!;
    expect(
      (
        await db.transactionCategory.findUniqueOrThrow({
          where: { transactionId: nextId },
        })
      ).category,
    ).toBe('Household');
    await db.rule.update({
      where: { id: batch.ruleId },
      data: { vendor: 'Edited later', updatedAt: new Date(Date.now() + 1000) },
    });
    expect((await review.undo(userId, batch.batchId)).ruleConflict).toBe(true);
    expect(
      (await db.rule.findUniqueOrThrow({ where: { id: batch.ruleId } }))
        .isActive,
    ).toBe(true);
  });
  it('rejects OAuth replay, refreshes credentials on the server, and cancels paused work', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const config = new ConfigService({
      EXPENSE_GMAIL_ENABLED: 'true',
      EXPENSE_GMAIL_PILOT_ONLY: 'true',
      INITIAL_ADMIN_EMAIL: user.email,
      EXPENSE_DATA_KEY: '11'.repeat(32),
      EXPENSE_TOKEN_KEY: '22'.repeat(32),
      EXPENSE_GOOGLE_CLIENT_ID: 'test-client',
      EXPENSE_GOOGLE_CLIENT_SECRET: 'test-secret',
      EXPENSE_GOOGLE_CALLBACK_URL:
        'http://localhost/email-connections/callback',
    });
    const crypto = new ExpenseCryptoService(config);
    const gmail = new GmailService(db, config, crypto, documents);
    const state = `state-${randomUUID()}`;
    await db.emailOAuthState.create({
      data: {
        id: createHash('sha256').update(state).digest('hex'),
        userId,
        verifier: crypto.encrypt('test-verifier', 'TOKEN'),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const fetch = jest.spyOn(globalThis, 'fetch');
    try {
      fetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: 'test-access',
              refresh_token: 'test-refresh',
              scope: 'https://www.googleapis.com/auth/gmail.readonly',
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              sub: randomUUID(),
              email: 'mailbox@example.test',
              email_verified: true,
            }),
          ),
        );
      const c = await gmail.callback(userId, 'code', state);
      await expect(gmail.callback(userId, 'code', state)).rejects.toThrow(
        'invalid OAuth state',
      );
      expect(fetch).toHaveBeenCalledTimes(2);
      expect((await gmail.owned(userId, c.id)).refreshToken).not.toContain(
        'test-refresh',
      );
      fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'refreshed' })),
      );
      expect(await gmail.accessToken(c.id, userId)).toBe('refreshed');
      const job = await db.expenseJob.create({
        data: {
          userId,
          connectionId: c.id,
          generation: 0,
          kind: 'BACKFILL',
          from: new Date('2026-09-01'),
          to: new Date('2026-10-01'),
        },
      });
      await gmail.action(userId, c.id, { action: 'pause' });
      expect(
        (await db.expenseJob.findUniqueOrThrow({ where: { id: job.id } }))
          .status,
      ).toBe('CANCELLED');
      await expect(gmail.collect({ ...job, pageToken: null })).rejects.toThrow(
        'CANCELLED',
      );
      await gmail.action(userId, c.id, { action: 'activate' });
      const resumed = await gmail.owned(userId, c.id);
      expect(
        await db.expenseJob.count({
          where: {
            connectionId: c.id,
            generation: resumed.generation,
            status: 'PENDING',
          },
        }),
      ).toBe(1);
      fetch.mockResolvedValueOnce(new Response(''));
      await gmail.action(userId, c.id, { action: 'disconnect' });
      expect((await gmail.owned(userId, c.id)).refreshToken).toBeNull();
      expect((await gmail.list(userId)).connections[0]).not.toHaveProperty(
        'refreshToken',
      );
    } finally {
      fetch.mockRestore();
    }
  });
  it('reclaims an expired worker lease and resumes the persisted page token', async () => {
    const c = await db.emailConnection.create({
      data: {
        userId,
        googleSubject: randomUUID(),
        email: 'worker@example.test',
        status: 'PREVIEW',
      },
    });
    const job = await db.expenseJob.create({
      data: {
        userId,
        connectionId: c.id,
        generation: c.generation,
        kind: 'BACKFILL',
        from: new Date('2026-09-01'),
        to: new Date('2026-10-01'),
        pageToken: 'page-two',
        status: 'RUNNING',
        leaseToken: 'expired',
        leaseUntil: new Date(Date.now() - 10000),
      },
    });
    const collect = jest.fn().mockResolvedValue(null);
    await new ExpenseJobsService(db, {
      enabled: () => true,
      collect,
    } as unknown as GmailService).tick();
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({ id: job.id, pageToken: 'page-two' }),
    );
    expect(
      (await db.expenseJob.findUniqueOrThrow({ where: { id: job.id } })).status,
    ).toBe('COMPLETED');
  });
  it('uses user-owned merchant aliases for future matching and rejects alias chains', async () => {
    const alias = await review.saveAlias(userId, {
      alias: 'GROCERY MART ONLINE',
      canonical: 'GROCERY MART',
    });
    const id = await alert(
      `alias:${randomUUID()}`,
      'GROCERY MART ONLINE',
      'ALIAS12345',
    );
    const transactionId = (await documents.detail(userId, id)).observations[0]
      .transactionId!;
    const row = await db.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: { category: true },
    });
    expect(row.merchantKey).toBe('grocery mart');
    expect(row.category?.category).toBe('Household');
    await expect(
      review.saveAlias(userId, {
        alias: 'CHAIN',
        canonical: 'GROCERY MART ONLINE',
      }),
    ).rejects.toThrow('without chains');
    await review.removeAlias(otherId, alias.id);
    expect(await review.aliases(userId)).toHaveLength(1);
  });
  it('matches a statement reference when the corresponding alert had no reference', async () => {
    const alertId = await documents.ingest({
      userId,
      accountId: cardId,
      sourceKey: `noref:${randomUUID()}`,
      kind: 'ALERT',
      fileName: 'alert.json',
      mimeType: 'application/json',
      metadata: {},
      bytes: Buffer.from(
        JSON.stringify({
          text: 'Your ICICI Bank credit card ending 1234 was used for INR 27.00 at STATIONERY SHOP on 03/10/2026.',
        }),
      ),
    });
    const id = (await documents.detail(userId, alertId)).observations[0]
      .transactionId;
    const statementId = await documents.ingest({
      userId,
      accountId: cardId,
      sourceKey: `statement:${randomUUID()}`,
      kind: 'UPLOAD',
      fileName: 'reference.csv',
      mimeType: 'text/csv',
      metadata: { sourceType: 'ICICI_AMAZON_PAY_CARD' },
      bytes: Buffer.from(
        'Transaction Date,Details,Amount,Reference Number\n03/10/2026,STATIONERY SHOP,27.00 Dr.,STATIONERY123',
      ),
    });
    expect(
      (await documents.detail(userId, statementId)).observations[0]
        .transactionId,
    ).toBe(id);
  });
  it('keeps historical chart gaps and switches between monthly and yearly aggregation', async () => {
    const reports = new DashboardService(db);
    const range = { from: '2020-01-01', to: '2026-12-31', accountId: cardId };
    const yearly = await reports.getCharts(userId, range);
    expect(yearly.aggregation).toBe('year');
    expect(yearly.monthlyTrend).toHaveLength(7);
    expect(yearly.monthlyTrend[0]).toEqual({ month: '2020', amount: null });
    const monthly = await reports.getCharts(userId, {
      ...range,
      aggregation: 'month',
    });
    expect(monthly.monthlyTrend).toHaveLength(84);
    expect(monthly.monthlyTrend[0].amount).toBeNull();
    const single = await reports.getSummary(userId, range);
    const combined = await reports.getSummary(userId, {
      from: range.from,
      to: range.to,
    });
    expect(combined.totalExpense).toBe(single.totalExpense);
    expect(single.totalExpense).toBe(
      single.confirmedExpense + single.unconfirmedExpense,
    );
  });
  it('retains upload balances, reviews unexplained card credits, and classifies both repayment entries as transfers', async () => {
    const bank = await accounts.create(userId, {
      name: 'Test bank',
      institution: 'ICICI',
      type: 'BANK_ACCOUNT',
    });
    const bankDoc = await documents.ingest({
      userId,
      accountId: bank.id,
      sourceKey: `bank:${randomUUID()}`,
      kind: 'UPLOAD',
      fileName: 'bank.csv',
      mimeType: 'text/csv',
      metadata: { sourceType: 'ICICI_BANK' },
      bytes: Buffer.from(
        'Transaction Date,Transaction Remarks,Withdrawal Amount,Deposit Amount,Balance\n03/10/2026,CREDIT CARD PAYMENT,800,,5000',
      ),
    });
    const bankId = (await documents.detail(userId, bankDoc)).observations[0]
      .transactionId!;
    const bankRow = await db.transaction.findUniqueOrThrow({
      where: { id: bankId },
      include: { category: true },
    });
    expect(Number(bankRow.balance)).toBe(5000);
    expect(bankRow.category?.expenseType).toBe('TRANSFER');
    const cardDoc = await documents.ingest({
      userId,
      accountId: cardId,
      sourceKey: `credit:${randomUUID()}`,
      kind: 'UPLOAD',
      fileName: 'credits.csv',
      mimeType: 'text/csv',
      metadata: { sourceType: 'ICICI_AMAZON_PAY_CARD' },
      bytes: Buffer.from(
        'Transaction Date,Details,Amount,Reference Number\n03/10/2026,PAYMENT RECEIVED,800.00 Cr.,REPAY123\n03/10/2026,UNKNOWN CREDIT,19.00 Cr.,UNKNOWN123\n03/10/2026,MERCHANT REFUND,5.00 Cr.,REFUND123',
      ),
    });
    const ids = (await documents.detail(userId, cardDoc)).observations.map(
      (o) => o.transactionId!,
    );
    const rows = await db.transaction.findMany({
      where: { id: { in: ids } },
      include: { category: true },
    });
    expect(
      rows.find((r) => r.referenceNumber === 'REPAY123')?.category?.expenseType,
    ).toBe('TRANSFER');
    expect(
      rows.find((r) => r.referenceNumber === 'UNKNOWN123')?.category
        ?.expenseType,
    ).toBe('REVIEW');
    expect(
      rows.find((r) => r.referenceNumber === 'REFUND123')?.category
        ?.expenseType,
    ).toBe('REFUND');
  });
  it('migrates legacy data without changing IDs or manual decisions or inventing original files', async () => {
    const client = new Client({ connectionString: url });
    const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const root = join(__dirname, '../prisma/migrations');
      const dirs = (await readdir(root))
        .filter((name) => /^\d/.test(name))
        .sort();
      for (const name of dirs.filter((name) => name < '20261004'))
        await client.query(
          await readFile(join(root, name, 'migration.sql'), 'utf8'),
        );
      await client.query(`
        INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('owner', 'legacy@example.test', NOW());
        INSERT INTO "Account" ("id", "userId", "name", "institution", "type", "updatedAt") VALUES ('account', 'owner', 'Legacy card', 'ICICI', 'CREDIT_CARD', NOW());
        INSERT INTO "Import" ("id", "userId", "accountId", "sourceType", "fileName", "fileHash") VALUES ('import', 'owner', 'account', 'ICICI_AMAZON_PAY_CARD', 'old.csv', 'legacy-hash');
        INSERT INTO "Transaction" ("id", "userId", "accountId", "importId", "sourceType", "transactionDate", "descriptionRaw", "descriptionClean", "moneyOut", "moneyIn", "netAmount", "transactionHash") VALUES
          ('manual', 'owner', 'account', 'import', 'ICICI_AMAZON_PAY_CARD', '2024-01-01', 'LEGACY CREDIT', 'LEGACY CREDIT', 0, 20, 20, 'manual-hash'),
          ('automatic', 'owner', 'account', 'import', 'ICICI_AMAZON_PAY_CARD', '2024-01-01', 'LEGACY CREDIT', 'LEGACY CREDIT', 0, 20, 20, 'auto-hash');
        INSERT INTO "TransactionCategory" ("id", "transactionId", "vendor", "category", "expenseType", "isManual", "updatedAt") VALUES
          ('manual-category', 'manual', 'My merchant', 'My category', 'REFUND', true, NOW()),
          ('auto-category', 'automatic', 'Old default', 'Refund', 'REFUND', false, NOW());
      `);
      for (const name of dirs.filter((name) => name >= '20261004'))
        await client.query(
          await readFile(join(root, name, 'migration.sql'), 'utf8'),
        );
      const rows = (
        await client.query<{
          id: string;
          reviewStatus: string;
          category: string;
          isManual: boolean;
        }>(
          'SELECT t."id", t."reviewStatus", c."category", c."isManual" FROM "Transaction" t JOIN "TransactionCategory" c ON c."transactionId" = t."id" ORDER BY t."id"',
        )
      ).rows;
      expect(rows).toEqual([
        {
          id: 'automatic',
          reviewStatus: 'NEEDS_REVIEW',
          category: 'Refund',
          isManual: false,
        },
        {
          id: 'manual',
          reviewStatus: 'USER_REVIEWED',
          category: 'My category',
          isManual: true,
        },
      ]);
      expect(
        (
          await client.query(
            'SELECT "encryptedBytes", "status", "statementFrom" FROM "SourceDocument"',
          )
        ).rows,
      ).toEqual([
        {
          encryptedBytes: null,
          status: 'ORIGINAL_UNAVAILABLE',
          statementFrom: null,
        },
      ]);
      expect(
        (
          await client.query(
            'SELECT "transactionId" FROM "SourceObservation" ORDER BY "transactionId"',
          )
        ).rows,
      ).toEqual([{ transactionId: 'automatic' }, { transactionId: 'manual' }]);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  }, 30000);
});
