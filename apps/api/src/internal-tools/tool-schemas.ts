import { z } from 'zod';
import { runSwingScanSchema } from '../scanner/scanner.dto';
import { validateTradeSchema } from '../risk/risk.dto';

export const emptyInputSchema = z.object({}).strict();

export const symbolInputSchema = z
  .object({
    symbol: z.string().trim().min(1),
  })
  .strict();

export const marketDataStatusInputSchema = z
  .object({
    symbols: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export const scannerReadinessInputSchema = z
  .object({
    symbols: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export const scanSwingCandidatesInputSchema = runSwingScanSchema;

export const validateTradeSetupInputSchema = validateTradeSchema;

export const createManualSuperOrderPlanInputSchema = validateTradeSchema;

export type SymbolInput = z.infer<typeof symbolInputSchema>;
export type MarketDataStatusInput = z.infer<typeof marketDataStatusInputSchema>;
export type ScannerReadinessInput = z.infer<typeof scannerReadinessInputSchema>;
