import { GmailService } from './gmail.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseCryptoService } from '../expense-core/expense-crypto.service';
import { SourceDocumentsService } from './source-documents.service';
import { parseAlert } from './expense-parser';
import { iciciSender, CARD_ALERT_SENDER } from './icici-mail';
const subject = 'Transaction alert for your ICICI Bank Credit Card';
const statementSubject =
  'ICICI Bank Statement from March 01, 2026 to March 31, 2026 for XXXXXXXX1234';
const auth =
  'mx.google.com; dkim=pass; dmarc=pass (p=REJECT) header.from=icici.bank.in';
const receipt =
  'Your ICICI Bank Credit Card XX1234 has been used for a transaction of INR 1,234.50 on Mar 07, 2026 at 18:34:40. Info: DEMO *SHOP. The Available Credit Limit on your card is INR 54,321.00 and Total Credit Limit is INR 90,000.00.';
const footer =
  'Never share your OTP, URN, CVV or passwords with anyone even if the person claims to be a bank employee.';
describe('ICICI bank.in email capture', () => {
  it('reads only the purchase, even with credit limits and a safety footer', () => {
    expect(parseAlert(receipt + ' ' + footer, true)).toMatchObject({
      version: 'icici-card-notice-v1',
      rows: [
        {
          transactionDate: '2026-03-07',
          descriptionRaw: 'DEMO *SHOP',
          moneyOut: 1234.5,
          moneyIn: 0,
          identifier: '1234',
          referenceNumber: null,
        },
      ],
    });
    expect(parseAlert(receipt.replace('Mar 07', 'Feb 30'), true).rows).toEqual(
      [],
    );
    expect(parseAlert(receipt.replace('Info:', 'Updated:'), true).rows).toEqual(
      [],
    );
    for (const prefix of [
      'OTP for transaction:',
      'Transaction declined.',
      'Payment request:',
    ]) {
      expect(parseAlert(prefix + receipt + footer, true).ignored).toBe(true);
    }
  });
  it('requires an exact, authenticated sender and the matching subject', () => {
    expect(iciciSender(CARD_ALERT_SENDER, subject, auth)).toBe(
      CARD_ALERT_SENDER,
    );
    expect(
      iciciSender(
        'Estatement <estatement@icici.bank.in>',
        statementSubject,
        auth,
      ),
    ).toBe('estatement@icici.bank.in');
    expect(
      iciciSender(
        'alerts@icicibank.com',
        subject,
        auth.replace('icici.bank.in', 'icicibank.com'),
      ),
    ).toBe('alerts@icicibank.com');
    expect(
      iciciSender(CARD_ALERT_SENDER, statementSubject, auth),
    ).toBeUndefined();
    expect(
      iciciSender(
        CARD_ALERT_SENDER,
        subject,
        auth.replace('dmarc=pass', 'dmarc=fail'),
      ),
    ).toBeUndefined();
    expect(
      iciciSender(
        CARD_ALERT_SENDER,
        subject,
        auth.replace('icici.bank.in', 'icicibank.com'),
      ),
    ).toBeUndefined();
    expect(
      iciciSender(CARD_ALERT_SENDER, subject, auth + '.example'),
    ).toBeUndefined();
  });
  it('discovers the new senders, retains the card receipt and statement PDF, and skips an actual OTP', async () => {
    const ingest = jest.fn<
      void,
      [Parameters<SourceDocumentsService['ingest']>[0]]
    >();
    const service = new GmailService(
      {
        emailConnection: {
          findFirst: jest.fn().mockResolvedValue({
            generation: 1,
            status: 'PREVIEW',
            googleSubject: 'test',
          }),
        },
      } as unknown as PrismaService,
      new ConfigService(),
      {} as ExpenseCryptoService,
      { ingest } as unknown as SourceDocumentsService,
    );
    jest.spyOn(service, 'accessToken').mockResolvedValue('test');
    const msg = (from: string, title: string, parts: unknown[]) => ({
      payload: {
        headers: [
          { name: 'From', value: from },
          { name: 'Subject', value: title },
          { name: 'Authentication-Results', value: auth },
        ],
        parts,
      },
    });
    const body = (txt: string) => ({
      mimeType: 'text/html',
      body: { data: Buffer.from(txt).toString('base64url') },
    });
    const responses = [
      { messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      msg(CARD_ALERT_SENDER, subject, [
        body('<p>' + receipt + '</p><p>' + footer + '</p>'),
      ]),
      msg('Estatement <estatement@icici.bank.in>', statementSubject, [
        {
          mimeType: 'application/octet-stream',
          filename: 'monthly.pdf',
          body: { attachmentId: 'p' },
        },
      ]),
      { data: Buffer.from('fixture bytes').toString('base64url') },
      msg(CARD_ALERT_SENDER, subject, [body('OTP for transaction INR 45.00')]),
    ];
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(Response.json(responses.shift())),
      );
    try {
      await service.collect({
        userId: 'u',
        connectionId: 'c',
        generation: 1,
        from: new Date('2026-03-01'),
        to: new Date('2026-04-01'),
        pageToken: null,
      });
      const requestUrl = request.mock.calls[0][0];
      if (typeof requestUrl !== 'string')
        throw new Error('Expected a Gmail request URL');
      const query = new URL(requestUrl).searchParams.get('q');
      expect(query).toContain('from:credit_cards@icici.bank.in');
      expect(query).toContain('from:estatement@icici.bank.in');
      expect(ingest).toHaveBeenCalledTimes(2);
      const [alert] = ingest.mock.calls[0];
      expect(alert).toMatchObject({
        kind: 'ALERT',
        metadata: { from: CARD_ALERT_SENDER },
      });
      const { text } = JSON.parse(alert.bytes.toString()) as { text: string };
      expect(parseAlert(text, true).rows[0]?.moneyOut).toBe(1234.5);
      expect(ingest).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          kind: 'STATEMENT',
          bytes: Buffer.from('fixture bytes'),
          fileName: 'monthly.pdf',
        }),
      );
    } finally {
      request.mockRestore();
    }
  });
});
