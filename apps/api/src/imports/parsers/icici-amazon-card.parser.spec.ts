import { SourceType } from '../../generated/prisma/enums';
import { IciciAmazonCardParser } from './icici-amazon-card.parser';
import { StatementRow } from './statement-parser.interface';

describe('IciciAmazonCardParser', () => {
  it('normalizes ICICI Amazon Pay card debit and credit rows', () => {
    const parser = new IciciAmazonCardParser();
    const rows: StatementRow[] = [
      ['Amazon Pay ICICI Credit Card'],
      ['Transaction Date', 'Details', 'Amount', 'Reference Number'],
      ['03/05/2026', 'Amazon Seller Services', '2,499.00 Dr', 'A123'],
      ['04/05/2026', 'Cashback Credit', '100.00 Cr', 'R123'],
    ];

    const preview = parser.parseRows(rows);

    expect(preview.stats).toMatchObject({
      totalRowsScanned: 4,
      parsedRows: 2,
      skippedRows: 2,
      errors: [],
    });
    expect(preview.rows[0]).toMatchObject({
      transactionDate: '2026-05-03',
      descriptionRaw: 'Amazon Seller Services',
      moneyOut: 2499,
      moneyIn: 0,
      netAmount: -2499,
      referenceNumber: 'A123',
      sourceType: SourceType.ICICI_AMAZON_PAY_CARD,
    });
    expect(preview.rows[1]).toMatchObject({
      transactionDate: '2026-05-04',
      moneyOut: 0,
      moneyIn: 100,
      netAmount: 100,
      referenceNumber: 'R123',
    });
  });
});
