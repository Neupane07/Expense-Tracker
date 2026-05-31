import { z } from 'zod';

export const SWING_SETUP_TYPES = [
  'BREAKOUT',
  'PULLBACK_TO_SUPPORT',
  'RSI_REVERSAL',
] as const;

export type SwingSetupType = (typeof SWING_SETUP_TYPES)[number];

export const runSwingScanSchema = z
  .object({
    symbols: z.array(z.string().trim().min(1)).optional(),
    universe: z.enum(['holdings', 'symbols']).optional(),
  })
  .strict();

export type RunSwingScanInput = z.infer<typeof runSwingScanSchema>;
