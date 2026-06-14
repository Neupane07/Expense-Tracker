import { z } from 'zod';

const asIsoString = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string(),
);

const nullableIsoString = z.preprocess(
  (value) =>
    value instanceof Date ? value.toISOString() : value == null ? null : value,
  z.string().nullable(),
);

export const dataQualityFieldsSchema = z
  .object({
    freshness: z.string().optional(),
    confidence: z.string().optional(),
    source: z.unknown().optional(),
    asOf: z.unknown().optional(),
    readiness: z.string().optional(),
  })
  .passthrough();

export const portfolioSnapshotOutputSchema = z
  .object({
    id: z.string(),
    snapshotTime: asIsoString,
    warnings: z.array(z.string()),
    priceAsOf: nullableIsoString.optional(),
    listedSummary: z
      .object({
        fallbackCount: z.number().optional(),
        holdingCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
    summary: z.record(z.string(), z.unknown()).optional(),
    allocation: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const marketDataStatusOutputSchema = z.object({
  universe: z.array(z.string()),
  universeSource: z.enum(['holdings', 'symbols']),
  symbols: z.array(
    z
      .object({
        symbol: z.string(),
        status: z.enum(['READY', 'DEGRADED', 'BLOCKED']),
        warnings: z.array(z.string()),
        blockers: z.array(z.string()),
        corporateAction: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
  ),
});

export const scannerReadinessOutputSchema = z
  .object({
    status: z.enum(['READY', 'DEGRADED', 'BLOCKED']),
    warnings: z.array(z.string()),
    blockers: z.array(z.string()),
    checks: z.array(z.record(z.string(), z.unknown())),
    universe: z.array(z.string()),
    universeSource: z.enum(['holdings', 'symbols']),
    researchDisclaimer: z.string().optional(),
  })
  .passthrough();

export const scanSwingCandidatesOutputSchema = z
  .object({
    runId: z.string(),
    runAt: asIsoString,
    universeSource: z.string(),
    universe: z.array(z.string()),
    candidateCount: z.number(),
    candidates: z.array(z.record(z.string(), z.unknown())),
    warnings: z.array(z.string()),
    researchDisclaimer: z.string().optional(),
  })
  .passthrough();

export const tradeValidationOutputSchema = z
  .object({
    valid: z.boolean(),
    symbol: z.string(),
    entry: z.number(),
    target: z.number(),
    stopLoss: z.number(),
    quantity: z.number(),
    rejectReasons: z.array(z.string()),
    warnings: z.array(z.string()),
    dataQuality: dataQualityFieldsSchema,
  })
  .passthrough();

export const stockDeepDiveOutputSchema = z.object({
  symbol: z.string(),
  sections: z.record(z.string(), z.unknown()),
  missingSections: z.array(
    z.object({
      id: z.string(),
      reason: z.string(),
    }),
  ),
  researchDisclaimer: z.string(),
});

export const researchSnapshotOutputSchema = z
  .object({
    symbol: z.string(),
    items: z.array(z.record(z.string(), z.unknown())),
    warnings: z.array(z.string()),
    dataQuality: dataQualityFieldsSchema,
    researchSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();

export const manualSuperOrderPlanOutputSchema = z.object({
  plan: z
    .object({
      side: z.literal('BUY'),
      product: z.literal('DELIVERY'),
      validity: z.literal('DAY'),
      symbol: z.string(),
      quantity: z.number(),
      limitPrice: z.number(),
      targetPrice: z.number(),
      stopLossPrice: z.number(),
    })
    .nullable(),
  validation: tradeValidationOutputSchema,
  disclaimer: z.string(),
});

export const toolErrorOutputSchema = z
  .object({
    message: z.string(),
    details: z.unknown().optional(),
  })
  .passthrough();
