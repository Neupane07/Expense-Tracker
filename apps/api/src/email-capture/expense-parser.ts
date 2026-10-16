import { z } from 'zod';
import { dateString, merchantKey } from '../expense-core/expense-validation';

export const observationSchema = z
  .object({
    transactionDate: dateString,
    postingDate: dateString.optional(),
    descriptionRaw: z.string().min(1).max(4000),
    merchantKey: z.string().min(1),
    descriptionClean: z.string().optional(),
    balance: z.number().nullable().optional(),
    paymentMethod: z.string().nullable().optional(),
    moneyOut: z.number().nonnegative().max(1e11),
    moneyIn: z.number().nonnegative().max(1e11),
    currency: z.literal('INR'),
    referenceNumber: z.string().nullable(),
    sourceType: z.enum(['ICICI_BANK', 'ICICI_AMAZON_PAY_CARD']),
    identifier: z.string().nullable(),
  })
  .refine(
    (x) => x.moneyIn > 0 !== x.moneyOut > 0,
    'Exactly one money direction is required',
  );
export type Observation = z.infer<typeof observationSchema>;
export type ParseResult = {
  version: string;
  rows: Observation[];
  error?: string;
  ignored?: boolean;
  from?: string;
  to?: string;
  reconciled?: boolean;
  rawRows: string[];
};
export const ALERT_VERSION = 'icici-alert-v1';
export const PDF_VERSION = 'icici-statement-v1';
export function isoDate(value: string): string | undefined {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value.trim());
  const candidate = m
    ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    : value.trim();
  return dateString.safeParse(candidate).success ? candidate : undefined;
}
export function parseAlert(text: string): ParseResult {
  const base = { version: ALERT_VERSION, rows: [], rawRows: [text] };
  if (
    /\b(?:OTP|one.time password|declined|unsuccessful|payment request|payment due|due date|minimum amount due)\b/i.test(
      text,
    )
  )
    return { ...base, ignored: true };
  const amount = /(?:INR|Rs\.?|₹)\s*([\d,]+\.\d{2})/i.exec(text);
  const date =
    /\b(?:on|dated)\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})\b/i.exec(
      text,
    );
  const card = /\b(?:credit card|amazon pay card)\b/i.test(text);
  const identifier =
    /(?:ending(?:\s+in)?|xx+|\*{2,})\s*(\d{4})\b/i.exec(text)?.[1] ?? null;
  const incoming =
    /\b(?:credited|refund(?:ed)?|reversed|payment received)\b/i.test(text);
  const outgoing = /\b(?:debited|spent|purchase|paid|used for)\b/i.test(text);
  const description =
    /\b(?:at|to|from)\s+(.+?)(?=\s+(?:on\s+\d{1,4}|using|with|ref(?:erence)?|available|avl)\b|[\r\n]|$)/i
      .exec(text)?.[1]
      ?.trim();
  if (!amount || !date || !description || incoming === outgoing || !identifier)
    return { ...base, error: 'UNSUPPORTED_TEMPLATE' };
  const parsed = observationSchema.safeParse({
    transactionDate: isoDate(date[1]),
    descriptionRaw:
      incoming && /\bpayment received\b/i.test(text)
        ? `Payment received: ${description}`
        : incoming && /\b(?:refund(?:ed)?|reversed)\b/i.test(text)
          ? `Refund: ${description}`
          : description,
    merchantKey: merchantKey(description),
    moneyOut: outgoing ? Number(amount[1].replace(/,/g, '')) : 0,
    moneyIn: incoming ? Number(amount[1].replace(/,/g, '')) : 0,
    currency: 'INR',
    referenceNumber:
      /\b(?:ref(?:erence)?(?:\s*(?:no|number))?|UTR)\s*[:.#-]?\s*([A-Z0-9-]{6,})/i.exec(
        text,
      )?.[1] ?? null,
    identifier,
    sourceType: card ? 'ICICI_AMAZON_PAY_CARD' : 'ICICI_BANK',
  });
  return parsed.success
    ? { ...base, rows: [parsed.data] }
    : { ...base, error: 'INVALID_TRANSACTION' };
}
export function parseStatementText(text: string): ParseResult {
  const lines = text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const base: ParseResult = { version: PDF_VERSION, rows: [], rawRows: lines };
  if (!/ICICI/i.test(text)) return { ...base, error: 'UNSUPPORTED_TEMPLATE' };
  const card = /amazon\s*pay|credit\s*card/i.test(text);
  if (card && !/amazon\s*pay/i.test(text))
    return { ...base, error: 'UNSUPPORTED_CARD_PRODUCT' };
  const identifier =
    /(?:ending(?:\s+in)?|xx+|\*{2,})\s*(\d{4})\b/i.exec(text)?.[1] ?? null;
  const period =
    /(?:statement period|period)\s*:?\s*(\d{2}[/-]\d{2}[/-]\d{4})\s*(?:to|[-–])\s*(\d{2}[/-]\d{2}[/-]\d{4})/i.exec(
      text,
    );
  base.from = period ? isoDate(period[1]) : undefined;
  base.to = period ? isoDate(period[2]) : undefined;
  for (const line of lines) {
    if (!/^\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/.test(line)) continue;
    // Supported format: date, narration, amount, explicit Dr/Cr. Never infer direction from column position.
    const m =
      /^(\d{1,2}[/-]\d{1,2}[/-]\d{4})\s+(.+?)\s+(?:INR\s*)?([\d,]+\.\d{2})\s+(Dr|Cr)\.?\s*(?:Ref\s*:?\s*([A-Z0-9-]+))?$/i.exec(
        line,
      );
    if (!m) return { ...base, rows: [], error: 'UNSUPPORTED_STATEMENT_ROW' };
    const amount = Number(m[3].replace(/,/g, ''));
    const parsed = observationSchema.safeParse({
      transactionDate: isoDate(m[1]),
      descriptionRaw: m[2],
      merchantKey: merchantKey(m[2]),
      moneyOut: m[4].toLowerCase() === 'dr' ? amount : 0,
      moneyIn: m[4].toLowerCase() === 'cr' ? amount : 0,
      currency: 'INR',
      referenceNumber: m[5] ?? null,
      sourceType: card ? 'ICICI_AMAZON_PAY_CARD' : 'ICICI_BANK',
      identifier,
    });
    if (!parsed.success)
      return { ...base, rows: [], error: 'INVALID_TRANSACTION' };
    base.rows.push(parsed.data);
  }
  if (!base.rows.length) return { ...base, error: 'UNSUPPORTED_TEMPLATE' };
  const amountAfter = (label: string) => {
    const match = new RegExp(
      `${label}\\s*:?\\s*(?:INR|Rs\\.?)?\\s*([\\d,]+\\.\\d{2})`,
      'i',
    ).exec(text);
    return match ? Math.round(Number(match[1].replace(/,/g, '')) * 100) : null;
  };
  const opening = amountAfter('opening balance'),
    closing = amountAfter('closing balance');
  const debit = amountAfter('total debits'),
    credit = amountAfter('total credits');
  const totalOut = base.rows.reduce(
    (n, r) => n + Math.round(r.moneyOut * 100),
    0,
  );
  const totalIn = base.rows.reduce(
    (n, r) => n + Math.round(r.moneyIn * 100),
    0,
  );
  base.reconciled = !!(
    base.from &&
    base.to &&
    base.from <= base.to &&
    base.rows.every(
      (r) => r.transactionDate >= base.from! && r.transactionDate <= base.to!,
    ) &&
    opening !== null &&
    closing !== null &&
    debit === totalOut &&
    credit === totalIn &&
    opening + (card ? totalOut - totalIn : totalIn - totalOut) === closing
  );
  return base;
}
