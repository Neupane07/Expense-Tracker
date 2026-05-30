import { z } from 'zod';

const finiteNumber = z.coerce.number().finite();

export const validateTradeSchema = z
  .object({
    symbol: z.string().trim().min(1),
    side: z.string().trim().min(1),
    entry: finiteNumber,
    target: finiteNumber,
    stopLoss: finiteNumber,
    capital: finiteNumber.optional(),
    quantity: finiteNumber.optional(),
    product: z.string().trim().min(1),
    mtf: z.boolean().optional(),
    fno: z.boolean().optional(),
  })
  .strict();

export type ValidateTradeInput = z.infer<typeof validateTradeSchema>;

export const positionSizeSchema = z
  .object({
    entry: finiteNumber,
    stopLoss: finiteNumber,
    availableCash: finiteNumber.optional(),
    maxCapitalPerTrade: finiteNumber.optional(),
    maxRiskPerTrade: finiteNumber.optional(),
    totalPortfolioValue: finiteNumber.optional(),
  })
  .strict();

export type PositionSizeInput = z.infer<typeof positionSizeSchema>;
