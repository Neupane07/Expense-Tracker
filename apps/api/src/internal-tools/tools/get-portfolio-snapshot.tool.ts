import { Injectable } from '@nestjs/common';
import { PortfolioService } from '../../portfolio/portfolio.service';
import { assessPortfolioSnapshotQuality } from '../portfolio-snapshot-quality';
import type { ToolContext, ToolHandlerResult } from '../tool.types';
import { emptyInputSchema } from '../tool-schemas';
import { portfolioSnapshotOutputSchema } from '../tool-output-schemas';

@Injectable()
export class GetPortfolioSnapshotTool {
  constructor(private readonly portfolio: PortfolioService) {}

  readonly definition = {
    name: 'get_portfolio_snapshot',
    version: '1',
    description:
      'Read-only portfolio snapshot with allocation, valuation summary, and warnings.',
    readOnly: true as const,
    inputSchema: emptyInputSchema,
    outputSchema: portfolioSnapshotOutputSchema,
    handler: (context: ToolContext) => this.handle(context),
  };

  async handle(context: ToolContext): Promise<ToolHandlerResult> {
    const snapshot = await this.portfolio.getSnapshot(context.userId);
    const quality = assessPortfolioSnapshotQuality({
      warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings : [],
      listedSummary: snapshot.listedSummary,
      priceAsOf: snapshot.priceAsOf,
    });

    return {
      status: quality.status,
      data: snapshot,
      dataQuality: {
        source: snapshot.source ?? null,
        asOf: snapshot.snapshotTime,
        freshness: quality.freshness,
        confidence: quality.confidence,
      },
      warnings: quality.warnings,
      rejectReasons: quality.rejectReasons,
      asOf: snapshot.snapshotTime,
    };
  }
}
