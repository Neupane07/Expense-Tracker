import { z } from 'zod';

const MCP_TRANSPORT_KEYS = new Set(['_meta']);

/**
 * Strip MCP transport metadata and keep only keys declared on the registry schema
 * before the shared executor runs strict Zod validation.
 */
export function normalizeMcpToolInput(
  rawInput: unknown,
  inputSchema: z.ZodType,
): unknown {
  if (rawInput == null) {
    return {};
  }

  if (typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return rawInput;
  }

  const record = { ...(rawInput as Record<string, unknown>) };

  for (const key of Object.keys(record)) {
    if (MCP_TRANSPORT_KEYS.has(key) || key.startsWith('_')) {
      delete record[key];
    }
  }

  const jsonSchema = z.toJSONSchema(inputSchema) as {
    properties?: Record<string, unknown>;
  };
  const allowedKeys = Object.keys(jsonSchema.properties ?? {});

  if (allowedKeys.length === 0) {
    return {};
  }

  const picked: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    if (key in record) {
      picked[key] = record[key];
    }
  }

  return picked;
}

export function createMcpInputSchema<T extends z.ZodType>(inputSchema: T) {
  return z.preprocess(
    (raw) => normalizeMcpToolInput(raw, inputSchema),
    inputSchema,
  );
}
