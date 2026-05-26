import { SourceType } from '../../generated/prisma/enums';
import { IciciBankParser } from './icici-bank.parser';
import { StatementRow } from './statement-parser.interface';

describe('IciciBankParser', () => {
  it('skips logo/header noise and normalizes ICICI bank rows', () => {
    const parser = new IciciBankParser();
    const rows: StatementRow[] = [
      ['ICICI Bank Logo'],
      ['Statement for account'],
      [
        'Transaction Date',
        'Transaction Remarks',
        'Withdrawal Amount',
        'Deposit Amount',
        'Balance',
      ],
      ['01/05/2026', 'UPI/SAFE/PURCHASE', '1,250.50', '', '48,749.50'],
      ['02/05/2026', 'NEFT SANITIZED INCOME', '', '100000', '148749.50'],
    ];

    const preview = parser.parseRows(rows);

    expect(preview.stats).toMatchObject({
      totalRowsScanned: 5,
      parsedRows: 2,
      skippedRows: 3,
      errors: [],
    });
    expect(preview.rows[0]).toEqual({
      transactionDate: '2026-05-01',
      descriptionRaw: 'UPI/SAFE/PURCHASE',
      descriptionClean: 'UPI/SAFE/PURCHASE',
      moneyOut: 1250.5,
      moneyIn: 0,
      netAmount: -1250.5,
      balance: 48749.5,
      referenceNumber: null,
      paymentMethod: 'UPI',
      sourceType: SourceType.ICICI_BANK,
    });
    expect(preview.rows[1].moneyIn).toBe(100000);
  });

  it('parses all 44 rows from a sanitized export-shaped bank statement', () => {
    const parser = new IciciBankParser();
    const preview = parser.parseRows(buildSanitizedBankExportRows());

    expect(preview.stats).toMatchObject({
      parsedRows: 44,
      recognizedTable: true,
      errors: [],
    });
    expect(preview.rows).toHaveLength(44);
    expect(preview.rows[0]).toMatchObject({
      descriptionRaw: 'SANITIZED TRANSFER 01',
      moneyOut: 101,
      moneyIn: 0,
    });
    expect(preview.rows[10]).toMatchObject({
      descriptionRaw: 'SANITIZED CREDIT ENTRY',
      moneyOut: 0,
      moneyIn: 250,
    });
  });
});

function buildSanitizedBankExportRows(): StatementRow[] {
  return [
    ['SANITIZED ICICI BANK EXPORT'],
    ['Account identifier', 'REDACTED'],
    [],
    [
      null,
      'S No.',
      'Value Date',
      'Transaction Date',
      'Cheque Number',
      'Transaction Remarks',
      'Withdrawal Amount(INR)',
      'Deposit Amount(INR)',
      'Balance(INR)',
    ],
    ...Array.from({ length: 44 }, (_, index) => {
      const day = String((index % 28) + 1).padStart(2, '0');
      const isCredit = index === 10;

      return [
        null,
        String(index + 1),
        `${day}/05/2026`,
        `${day}/05/2026`,
        '',
        isCredit
          ? 'SANITIZED CREDIT ENTRY'
          : `SANITIZED TRANSFER ${String(index + 1).padStart(2, '0')}`,
        isCredit ? '' : `${index + 101}.00`,
        isCredit ? '250.00' : '',
        `${10000 - index}.00`,
      ];
    }),
  ];
}
