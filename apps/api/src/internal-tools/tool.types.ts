import type { z } from 'zod';

export type ToolExecutionStatus = 'ok' | 'rejected' | 'unavailable' | 'error';

export type ToolContext = {
  userId: string;
  userEmail: string;
  userRole: string;
  abortSignal?: AbortSignal;
};

export type ToolHandlerResult<TData = unknown> = {
  status: ToolExecutionStatus;
  data: TData;
  dataQuality?: Record<string, unknown>;
  warnings?: string[];
  rejectReasons?: string[];
  asOf?: string | Date | null;
  errorCode?: string | null;
};

export type ToolEnvelope<TData = unknown> = {
  tool: string;
  version: string;
  asOf: string;
  status: ToolExecutionStatus;
  data: TData;
  dataQuality: Record<string, unknown>;
  warnings: string[];
  rejectReasons: string[];
  auditId: string;
  durationMs: number;
};

export type ToolCatalogEntry = {
  name: string;
  version: string;
  description: string;
  readOnly: true;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
};

export type ToolDefinition<TInput = unknown, TData = unknown> = {
  name: string;
  version: string;
  description: string;
  readOnly: true;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TData>;
  timeoutMs?: number;
  maxResultBytes?: number;
  handler: (
    context: ToolContext,
    input: TInput,
  ) => Promise<ToolHandlerResult<TData>>;
};

export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESULT_BYTES = 512_000;
