import { toIsoTimestamp } from '../common/data-quality';
import type {
  ToolEnvelope,
  ToolExecutionStatus,
  ToolHandlerResult,
} from './tool.types';

export function buildToolEnvelope<TData>(input: {
  tool: string;
  version: string;
  auditId: string;
  durationMs: number;
  result: ToolHandlerResult<TData>;
}): ToolEnvelope<TData> {
  return {
    tool: input.tool,
    version: input.version,
    asOf:
      toIsoTimestamp(input.result.asOf ?? new Date()) ??
      new Date().toISOString(),
    status: input.result.status,
    data: input.result.data,
    dataQuality: input.result.dataQuality ?? {},
    warnings: unique(input.result.warnings ?? []),
    rejectReasons: unique(input.result.rejectReasons ?? []),
    auditId: input.auditId,
    durationMs: input.durationMs,
  };
}

export function mapPrismaToolStatus(
  status: ToolExecutionStatus,
): 'OK' | 'REJECTED' | 'UNAVAILABLE' | 'ERROR' {
  switch (status) {
    case 'ok':
      return 'OK';
    case 'rejected':
      return 'REJECTED';
    case 'unavailable':
      return 'UNAVAILABLE';
    default:
      return 'ERROR';
  }
}

export function mapPrismaStatusToToolStatus(
  status: 'OK' | 'REJECTED' | 'UNAVAILABLE' | 'ERROR',
): ToolExecutionStatus {
  switch (status) {
    case 'OK':
      return 'ok';
    case 'REJECTED':
      return 'rejected';
    case 'UNAVAILABLE':
      return 'unavailable';
    default:
      return 'error';
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}
