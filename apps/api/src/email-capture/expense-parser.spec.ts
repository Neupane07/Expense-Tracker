import { parseAlert, parseStatementText, isoDate } from './expense-parser';
describe('ICICI candidate extraction (synthetic fixtures; not production validation)', () => {
  it('extracts a dated purchase with amount, account identifier and merchant', () => {
    const p = parseAlert(
      'Your ICICI Bank credit card ending 1234 was used for INR 1,200.00 at GROCERY MART on 01/10/2026. Ref: SAFE12345',
    );
    expect(p.rows[0]).toMatchObject({
      transactionDate: '2026-10-01',
      merchantKey: 'grocery mart',
      moneyOut: 1200,
      moneyIn: 0,
      identifier: '1234',
      sourceType: 'ICICI_AMAZON_PAY_CARD',
    });
  });
  it.each([
    'OTP for transaction INR 10.00',
    'Transaction declined',
    'Payment request received',
    'Payment due on 01/10/2026',
  ])('ignores non-transactions: %s', (text) =>
    expect(parseAlert(text).ignored).toBe(true),
  );
  it('does not invent missing dates, direction, or amounts', () => {
    expect(
      parseAlert('Credit card ending 1234 was used for INR 10.00 at SHOP').rows,
    ).toEqual([]);
    expect(isoDate('31/02/2026')).toBeUndefined();
  });
  it('reconciles a complete card statement only when all totals agree', () => {
    const text =
      'ICICI Amazon Pay credit card ending 1234\nStatement period: 01/10/2026 to 31/10/2026\nOpening balance: 0.00\n01/10/2026 GROCERY MART 1200.00 Dr Ref SAFE12345\nTotal debits: 1200.00\nTotal credits: 0.00\nClosing balance: 1200.00';
    expect(parseStatementText(text)).toMatchObject({
      reconciled: true,
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(
      parseStatementText(
        text.replace('Closing balance: 1200.00', 'Closing balance: 1199.00'),
      ).reconciled,
    ).toBe(false);
    expect(parseStatementText(text + '\n02/10/2026 unreadable row').error).toBe(
      'UNSUPPORTED_STATEMENT_ROW',
    );
  });
});
