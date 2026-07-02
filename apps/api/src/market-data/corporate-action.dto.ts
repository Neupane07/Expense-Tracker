import { z } from 'zod';

export const corporateActionImportEventSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.string().min(1).default('NSE'),
  securityId: z.string().optional(),
  eventType: z.enum([
    'SPLIT',
    'BONUS',
    'DIVIDEND',
    'RIGHTS',
    'SYMBOL_CHANGE',
    'MERGER',
    'DEMERGER',
    'BUYBACK',
    'OTHER',
  ]),
  effectiveDate: z.string().min(1),
  exDate: z.string().optional(),
  recordDate: z.string().optional(),
  ratioNumerator: z.number().positive().optional(),
  ratioDenominator: z.number().positive().optional(),
  cashAmount: z.number().nonnegative().optional(),
  source: z.string().min(1),
  sourceEventId: z.string().min(1),
  rawEvidence: z.record(z.string(), z.unknown()).default({}),
  supersedesSourceEventId: z.string().optional(),
});

export const corporateActionImportSchema = z.object({
  events: z.array(corporateActionImportEventSchema).min(1),
});

export type CorporateActionImportEvent = z.infer<
  typeof corporateActionImportEventSchema
>;
