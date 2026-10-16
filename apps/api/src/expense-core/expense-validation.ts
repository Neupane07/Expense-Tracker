import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { TransactionWhereInput } from '../generated/prisma/models/Transaction';

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(result.error.issues.map((i) => i.message));
  return result.data;
}
export const dateString = z.iso.date();
export const periodSchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    accountId: z.string().min(1).optional(),
    accountIds: z.string().max(4000).optional(),
    aggregation: z.enum(['auto', 'month', 'year']).optional(),
  })
  .refine(
    (x) => !(x.month && (x.from || x.to)),
    'Use month or from/to, not both',
  )
  .refine(
    (x) => !x.from || !x.to || x.from <= x.to,
    'from must be on or before to',
  );
export type ExpensePeriod = z.infer<typeof periodSchema>;
export function expenseWhere(input: unknown): TransactionWhereInput {
  const p = parseInput(periodSchema, input);
  const ids = [
    ...new Set([
      ...(p.accountIds?.split(',').filter(Boolean) ?? []),
      ...(p.accountId ? [p.accountId] : []),
    ]),
  ];
  let start = p.from ? new Date(p.from) : undefined;
  let end = p.to ? new Date(new Date(p.to).getTime() + 86400000) : undefined;
  if (p.month) {
    start = new Date(`${p.month}-01`);
    end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );
  }
  return {
    ...(ids.length ? { accountId: { in: ids } } : {}),
    ...(start || end
      ? {
          transactionDate: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lt: end } : {}),
          },
        }
      : {}),
  };
}
export const merchantKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(?:upi|pos|purchase|debit|credit|inr|rs)\b/g, ' ')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/[^a-z0-9@.]+/g, ' ')
    .trim();
