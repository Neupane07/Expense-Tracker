/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers and transaction mocks */
import { ImportsService } from './imports.service';
import { IciciBankParser } from './parsers/icici-bank.parser';
import { IciciAmazonCardParser } from './parsers/icici-amazon-card.parser';
import { SourceDocumentsService } from '../email-capture/source-documents.service';
import { PrismaService } from '../prisma/prisma.service';
const file = (text: string) =>
  ({
    originalname: 'sanitized.csv',
    buffer: Buffer.from(text),
  }) as Express.Multer.File;
describe('statement import evidence pipeline', () => {
  function setup() {
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ id: 'a' }) },
      import: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'import' }),
        update: jest.fn().mockResolvedValue({ id: 'import' }),
      },
      transaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const documents = {
      ingest: jest.fn().mockResolvedValue('doc'),
      detail: jest.fn().mockResolvedValue({
        observations: [{ transactionId: 't' }],
        errorCode: null,
      }),
    };
    return {
      prisma,
      documents,
      service: new ImportsService(
        prisma as unknown as PrismaService,
        new IciciBankParser(),
        new IciciAmazonCardParser(),
        documents as unknown as SourceDocumentsService,
      ),
    };
  }
  it('rejects a readable file with no recognized statement table', async () => {
    const { service } = setup();
    await expect(
      service.preview('u', {
        accountId: 'a',
        sourceType: 'ICICI_BANK',
        file: file('Heading,Value\nRedacted,Other'),
      }),
    ).rejects.toThrow('No recognized');
  });
  it('routes uploaded bytes through preserved evidence and links only new transactions to the import', async () => {
    const { service, documents, prisma } = setup();
    await service.create('u', {
      accountId: 'a',
      sourceType: 'ICICI_AMAZON_PAY_CARD',
      file: file(
        'Transaction Date,Details,Amount,Reference Number\n01/05/2026,FOOD SHOP,20.00 Dr.,SAFE-REFERENCE',
      ),
    });
    expect(documents.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u',
        accountId: 'a',
        kind: 'UPLOAD',
        bytes: expect.any(Buffer),
      }),
    );
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u', importId: null }),
      }),
    );
  });
  it('persists failure and permits retry of previously failed imports', async () => {
    const { service, prisma, documents } = setup();
    prisma.import.findUnique.mockResolvedValue({
      id: 'failed',
      status: 'FAILED',
    });
    documents.ingest.mockRejectedValue(new Error('PARSER_FAILURE'));
    await expect(
      service.create('u', {
        accountId: 'a',
        sourceType: 'ICICI_AMAZON_PAY_CARD',
        file: file(
          'Transaction Date,Details,Amount,Reference Number\n01/05/2026,FOOD SHOP,20.00 Dr.,SAFE-REFERENCE',
        ),
      }),
    ).rejects.toThrow('PARSER_FAILURE');
    expect(prisma.import.create).not.toHaveBeenCalled();
    expect(prisma.import.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});
