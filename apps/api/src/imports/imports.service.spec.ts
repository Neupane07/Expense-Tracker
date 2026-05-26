import {
  ImportStatus,
  ExpenseType,
  MatchType,
  SourceType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImportsService } from './imports.service';
import { IciciAmazonCardParser } from './parsers/icici-amazon-card.parser';
import { IciciBankParser } from './parsers/icici-bank.parser';

type PrismaMocks = {
  account: { findUnique: jest.Mock };
  import: { create: jest.Mock; update: jest.Mock };
  rule: { findMany: jest.Mock };
  transaction: { findMany: jest.Mock; create: jest.Mock };
  transactionCategory: { create: jest.Mock };
};

type ImportUpdateInput = {
  data: { status: ImportStatus; errorMessage: string };
};

type CategoryCreateInput = {
  data: {
    transactionId: string;
    expenseType: ExpenseType;
    ruleId: string | null;
  };
};

describe('ImportsService', () => {
  let prisma: PrismaMocks;
  let service: ImportsService;

  beforeEach(() => {
    prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ id: 'account-1' }) },
      import: { create: jest.fn(), update: jest.fn() },
      rule: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      transactionCategory: { create: jest.fn() },
    };
    service = new ImportsService(
      prisma as unknown as PrismaService,
      new IciciBankParser(),
      new IciciAmazonCardParser(),
    );
  });

  it('rejects preview when a readable statement has no recognized table', async () => {
    await expect(
      service.preview('user-1', {
        accountId: 'account-1',
        sourceType: SourceType.ICICI_AMAZON_PAY_CARD,
        file: csvFile('Heading,Value\nSANITIZED STATEMENT,REDACTED\n'),
      }),
    ).rejects.toThrow(
      'No recognized ICICI Amazon Pay Card transaction table was found',
    );
  });

  it('rejects preview when a recognized table contains no valid rows', async () => {
    await expect(
      service.preview('user-1', {
        accountId: 'account-1',
        sourceType: SourceType.ICICI_AMAZON_PAY_CARD,
        file: csvFile(
          'Transaction Date,Details,Amount,Reference Number\nnot-a-date,SANITIZED ROW,not-an-amount,SAFE-REFERENCE\n',
        ),
      }),
    ).rejects.toThrow(
      'transaction table was found, but it contains no valid transaction rows',
    );
  });

  it('marks a confirm attempt failed when it contains zero parsed rows', async () => {
    prisma.import.create.mockResolvedValue({ id: 'import-zero' });
    prisma.import.update.mockResolvedValue({ id: 'import-zero' });

    await expect(
      service.create('user-1', {
        accountId: 'account-1',
        sourceType: SourceType.ICICI_BANK,
        file: csvFile(
          'Transaction Date,Transaction Remarks,Withdrawal Amount,Deposit Amount,Balance\nnot-a-date,SANITIZED ROW,,,0\n',
        ),
      }),
    ).rejects.toThrow('contains no valid transaction rows');

    const updates = prisma.import.update.mock
      .calls as unknown as ImportUpdateInput[][];
    const update = updates[0][0];

    expect(update.data.status).toBe(ImportStatus.FAILED);
    expect(update.data.errorMessage).toContain(
      'contains no valid transaction rows',
    );
  });

  it('classifies card credits and reversals as refunds before expense rules', async () => {
    prisma.import.create.mockResolvedValue({ id: 'import-1' });
    prisma.rule.findMany.mockResolvedValue([
      {
        id: 'expense-rule',
        matchType: MatchType.CONTAINS,
        pattern: 'sanitized',
        vendor: 'Purchase',
        category: 'Purchase',
        subcategory: null,
        expenseType: ExpenseType.EXPENSE,
      },
    ]);
    prisma.transaction.create
      .mockResolvedValueOnce({ id: 'transaction-credit' })
      .mockResolvedValueOnce({ id: 'transaction-reversal' });
    prisma.transactionCategory.create.mockResolvedValue({});
    prisma.import.update.mockResolvedValue({
      id: 'import-1',
      fileName: 'sanitized.csv',
      status: ImportStatus.COMPLETED,
      totalRows: 3,
      importedRows: 2,
      duplicateRows: 0,
      failedRows: 0,
    });

    await service.create('user-1', {
      accountId: 'account-1',
      sourceType: SourceType.ICICI_AMAZON_PAY_CARD,
      file: csvFile(
        [
          'Transaction Date,Details,Amount,Reference Number',
          '01/05/2026,SANITIZED CARD CREDIT,20.00 Cr.,SAFE-REFERENCE-01',
          '02/05/2026,SANITIZED MERCHANT REVERSAL,10.00 Dr.,SAFE-REFERENCE-02',
        ].join('\n'),
      ),
    });

    const calls = prisma.transactionCategory.create.mock
      .calls as CategoryCreateInput[][];
    const categories = calls.map(([input]) => input.data);

    expect(categories[0]).toMatchObject({
      transactionId: 'transaction-credit',
      expenseType: ExpenseType.REFUND,
      ruleId: null,
    });
    expect(categories[1]).toMatchObject({
      transactionId: 'transaction-reversal',
      expenseType: ExpenseType.REFUND,
      ruleId: null,
    });
  });
});

function csvFile(contents: string) {
  return {
    originalname: 'sanitized.csv',
    buffer: Buffer.from(contents),
  } as Express.Multer.File;
}
