import { Injectable } from '@nestjs/common';
import { ScannerReadinessService } from '../../scanner/scanner-readiness.service';
import { throwIfAborted } from '../tool-abort';
import type { ToolContext, ToolHandlerResult } from '../tool.types';
import { scannerReadinessOutputSchema } from '../tool-output-schemas';
import {
  scannerReadinessInputSchema,
  type ScannerReadinessInput,
} from '../tool-schemas';

@Injectable()
export class GetScannerReadinessTool {
  constructor(private readonly readiness: ScannerReadinessService) {}

  readonly definition = {
    name: 'get_scanner_readiness',
    version: '1',
    description:
      'Deterministic scanner readiness diagnostics for credentials, sync, mapping, prices, candles, indicators, research, and portfolio context.',
    readOnly: true as const,
    inputSchema: scannerReadinessInputSchema,
    outputSchema: scannerReadinessOutputSchema,
    handler: (context: ToolContext, input: ScannerReadinessInput) =>
      this.handle(context, input),
  };

  async handle(
    context: ToolContext,
    input: ScannerReadinessInput,
  ): Promise<ToolHandlerResult> {
    throwIfAborted(context.abortSignal);
    const report = await this.readiness.getReadiness(context.userId, input);
    throwIfAborted(context.abortSignal);

    return {
      status:
        report.status === 'BLOCKED'
          ? 'unavailable'
          : report.status === 'DEGRADED'
            ? 'rejected'
            : 'ok',
      data: report,
      dataQuality: {
        readiness: report.status,
        source: report.source,
        asOf: report.asOf,
        freshness: report.checks.some((check) => check.freshness === 'STALE')
          ? 'STALE'
          : report.checks.some((check) => check.freshness === 'MISSING')
            ? 'MISSING'
            : 'RECENT',
      },
      warnings: report.warnings,
      rejectReasons: report.blockers,
      asOf: report.asOf,
    };
  }
}
