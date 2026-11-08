// Keep Gmail discovery and message admission on the same sender list.
export const CARD_ALERT_SENDER = 'credit_cards@icici.bank.in';
const bankStatementSender = 'estatement@icici.bank.in';
const senders = new Set([
  'alerts@icicibank.com',
  'credit_cards@icicibank.com',
  'customercare@icicibank.com',
  CARD_ALERT_SENDER,
  bankStatementSender,
]);
export const senderQuery =
  '{' + [...senders].map((s) => 'from:' + s).join(' ') + '}';
export function iciciSender(
  from: string,
  subject: string,
  authentication: string,
) {
  const address = (
    from.trim().match(/^[^<>,]*<([^<>]+)>$/)?.[1] ?? from.trim()
  ).toLowerCase();
  if (!senders.has(address)) return;
  if (
    address === CARD_ALERT_SENDER &&
    !/^transaction alert for your ICICI Bank Credit Card$/i.test(subject.trim())
  )
    return;
  if (
    address === bankStatementSender &&
    !/^ICICI Bank Statement from\s/i.test(subject.trim())
  )
    return;
  if (!/^mx\.google\.com;/i.test(authentication)) return;
  const domain = address.split('@')[1];
  if (
    !authentication
      .split(';')
      .some(
        (clause) =>
          /^\s*dmarc=pass(?:\s|$)/i.test(clause) &&
          clause.match(/\bheader\.from=([^\s;]+)/i)?.[1].toLowerCase() ===
            domain,
      )
  )
    return;
  return address;
}
