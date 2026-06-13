import { z } from 'zod';

export const scannerReadinessQuerySchema = z
  .object({
    symbols: z.string().trim().min(1).optional(),
  })
  .strict();

export type ScannerReadinessQuery = z.infer<typeof scannerReadinessQuerySchema>;

export function parseScannerReadinessQuery(
  query: Record<string, string | undefined>,
) {
  const parsed = scannerReadinessQuerySchema.safeParse(query);

  if (!parsed.success) {
    return { symbols: undefined };
  }

  const symbols = parsed.data.symbols
    ?.split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  return { symbols };
}
