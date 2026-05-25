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
      ['01/05/2026', 'UPI/PAYTM/Zepto', '1,250.50', '', '48,749.50'],
      ['02/05/2026', 'NEFT Salary', '', '100000', '148749.50'],
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
      descriptionRaw: 'UPI/PAYTM/Zepto',
      descriptionClean: 'UPI/PAYTM/Zepto',
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
});
