import { z } from 'zod';

const optionalHttpUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((value) => !value || /^https?:\/\//i.test(value), {
    message: 'Must be an http(s) URL',
  });

export const RESEARCH_CATEGORIES = [
  'RESULT',
  'ORDER_WIN',
  'CORPORATE_ACTION',
  'REGULATORY',
  'MANAGEMENT_COMMENTARY',
  'SECTOR_NEWS',
  'COMPANY_NEWS',
  'USER_NOTE',
  'RISK_FLAG',
  'OTHER',
] as const;

export const RESEARCH_IMPACTS = [
  'POSITIVE',
  'NEGATIVE',
  'NEUTRAL',
  'MIXED',
  'UNKNOWN',
] as const;

export const listResearchItemsQuerySchema = z
  .object({
    symbol: z.string().trim().min(1).optional(),
    category: z.enum(RESEARCH_CATEGORIES).optional(),
    impact: z.enum(RESEARCH_IMPACTS).optional(),
  })
  .strict();

export type ListResearchItemsQuery = z.infer<
  typeof listResearchItemsQuerySchema
>;

const evidenceInputSchema = z
  .object({
    label: z.string().trim().min(1),
    value: z.string().trim().min(1),
    unit: z.string().trim().min(1).optional().nullable(),
    evidenceDate: z.string().datetime().optional().nullable(),
    sourceUrl: optionalHttpUrl,
  })
  .strict();

export const createResearchItemSchema = z
  .object({
    symbol: z.string().trim().min(1),
    title: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(8000),
    category: z.enum(RESEARCH_CATEGORIES),
    impact: z.enum(RESEARCH_IMPACTS),
    sourceType: z.string().trim().min(1).max(100),
    sourceName: z.string().trim().min(1).max(200),
    sourceUrl: optionalHttpUrl,
    publishedAt: z.string().datetime().optional().nullable(),
    evidence: z.array(evidenceInputSchema).optional(),
  })
  .strict();

export type CreateResearchItemInput = z.infer<typeof createResearchItemSchema>;

export type ResearchEvidenceInput = z.infer<typeof evidenceInputSchema>;
