import { z } from 'zod';

const finiteNumber = z.coerce.number().finite();

export const TRADE_JOURNAL_STATUSES = [
  'PLANNED',
  'ACTIVE',
  'CLOSED',
  'CANCELLED',
] as const;

export const TRADE_JOURNAL_PRODUCTS = ['DELIVERY'] as const;

export const listEntriesQuerySchema = z
  .object({
    status: z.enum(TRADE_JOURNAL_STATUSES).optional(),
    symbol: z.string().trim().min(1).optional(),
    dateFrom: z.string().trim().min(1).optional(),
    dateTo: z.string().trim().min(1).optional(),
  })
  .strict();

export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;

export const createEntrySchema = z
  .object({
    symbol: z.string().trim().min(1),
    side: z.string().trim().min(1).default('BUY'),
    product: z.string().trim().min(1).default('DELIVERY'),
    plannedEntry: finiteNumber,
    plannedTarget: finiteNumber,
    plannedStopLoss: finiteNumber,
    quantity: z.coerce.number().int().positive(),
    setupType: z.string().trim().min(1).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    status: z.enum(['PLANNED', 'ACTIVE']).optional(),
  })
  .strict();

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

export const updateEntrySchema = z
  .object({
    plannedEntry: finiteNumber.optional(),
    plannedTarget: finiteNumber.optional(),
    plannedStopLoss: finiteNumber.optional(),
    quantity: z.coerce.number().int().positive().optional(),
    setupType: z.string().trim().min(1).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    status: z.enum(TRADE_JOURNAL_STATUSES).optional(),
    exitPrice: finiteNumber.optional(),
    exitAt: z.string().datetime().optional(),
    exitReason: z.string().trim().max(2000).optional().nullable(),
    mistakeTags: z.array(z.string().trim().min(1)).optional(),
    lessonLearned: z.string().trim().max(4000).optional().nullable(),
  })
  .strict();

export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

export const fromScannerCandidateSchema = z
  .object({
    symbol: z.string().trim().min(1),
    setupType: z.string().trim().min(1),
    swingScanRunId: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int().positive().optional(),
    notes: z.string().trim().max(4000).optional().nullable(),
  })
  .strict();

export type FromScannerCandidateInput = z.infer<
  typeof fromScannerCandidateSchema
>;
