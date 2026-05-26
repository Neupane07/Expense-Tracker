import { SourceType } from '../../generated/prisma/enums';
import { IciciAmazonCardParser } from './icici-amazon-card.parser';
import { StatementRow } from './statement-parser.interface';

describe('IciciAmazonCardParser', () => {
  it('normalizes ICICI Amazon Pay card debit and credit rows', () => {
    const parser = new IciciAmazonCardParser();
    const rows: StatementRow[] = [
      ['Amazon Pay ICICI Credit Card'],
      ['Transaction Date', 'Details', 'Amount', 'Reference Number'],
      [
        '03/05/2026',
        'SANITIZED PURCHASE',
        '2,499.00 Dr',
        'SAFE-DEBIT-REFERENCE',
      ],
      [
        '04/05/2026',
        'SANITIZED CASHBACK CREDIT',
        '100.00 Cr',
        'SAFE-CREDIT-REFERENCE',
      ],
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
      descriptionRaw: 'SANITIZED PURCHASE',
      moneyOut: 2499,
      moneyIn: 0,
      netAmount: -2499,
      referenceNumber: 'SAFE-DEBIT-REFERENCE',
      sourceType: SourceType.ICICI_AMAZON_PAY_CARD,
    });
    expect(preview.rows[1]).toMatchObject({
      transactionDate: '2026-05-04',
      moneyOut: 0,
      moneyIn: 100,
      netAmount: 100,
      referenceNumber: 'SAFE-CREDIT-REFERENCE',
    });
  });

  it('parses all 38 rows from a sanitized export-shaped card statement', () => {
    const parser = new IciciAmazonCardParser();
    const preview = parser.parseRows(buildSanitizedCardExportRows());

    expect(preview.stats).toMatchObject({
      parsedRows: 38,
      recognizedTable: true,
      errors: [],
    });
    expect(preview.rows).toHaveLength(38);
    expect(preview.rows[0]).toMatchObject({
      descriptionRaw: 'SANITIZED PURCHASE 01',
      moneyOut: 100.01,
      moneyIn: 0,
    });
    expect(preview.rows[1]).toMatchObject({
      descriptionRaw: 'SANITIZED CASHBACK CREDIT',
      moneyOut: 0,
      moneyIn: 25,
    });
    expect(preview.rows[22]).toMatchObject({
      descriptionRaw: 'SANITIZED REVERSAL CREDIT',
      moneyOut: 0,
      moneyIn: 75,
    });
  });
});

function buildSanitizedCardExportRows(): StatementRow[] {
  return [
    ['SANITIZED ICICI AMAZON PAY CARD EXPORT'],
    ['Card identifier', null, null, null, 'REDACTED'],
    ['Transaction Details'],
    [
      'Transaction Date',
      null,
      null,
      null,
      'Details',
      null,
      null,
      null,
      'Amount (INR)',
      null,
      null,
      null,
      'Reference Number',
    ],
    [],
    ...Array.from({ length: 38 }, (_, index) => {
      const day = String((index % 28) + 1).padStart(2, '0');
      const creditDetails = new Map([
        [1, ['SANITIZED CASHBACK CREDIT', '25.00 Cr.']],
        [22, ['SANITIZED REVERSAL CREDIT', '75.00 Cr.']],
        [25, ['SANITIZED REFUND CREDIT', '50.00 Cr.']],
      ]);
      const [details, amount] = creditDetails.get(index) ?? [
        `SANITIZED PURCHASE ${String(index + 1).padStart(2, '0')}`,
        `${100 + (index + 1) / 100} Dr.`,
      ];

      return [
        `${day}/05/2026`,
        null,
        null,
        null,
        details,
        null,
        null,
        null,
        amount,
        null,
        null,
        null,
        `SAFE-REFERENCE-${String(index + 1).padStart(2, '0')}`,
      ];
    }),
  ];
}
