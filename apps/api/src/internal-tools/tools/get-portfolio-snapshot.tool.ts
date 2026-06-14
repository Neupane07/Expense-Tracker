import { Injectable } from '@nestjs/common';
import { PortfolioService } from '../../portfolio/portfolio.service';
import type { ToolContext, ToolHandlerResult } from '../tool.types';
import { emptyInputSchema, portfolioSnapshotDataSchema } from '../tool-schemas';

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
    outputSchema: portfolioSnapshotDataSchema,
    handler: (context: ToolContext) => this.handle(context),
  };

  async handle(context: ToolContext): Promise<ToolHandlerResult> {
    const snapshot = await this.portfolio.getSnapshot(context.userId);
    const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
    const hasBlockers = warnings.some((warning) =>
      /missing|unavailable|no synced/i.test(warning),
    );

    return {
      status: hasBlockers ? 'unavailable' : 'ok',
      data: snapshot,
      dataQuality: {
        source: snapshot.source ?? null,
        asOf: snapshot.snapshotTime,
        freshness: snapshot.priceAsOf ? 'RECENT' : 'MISSING',
      },
      warnings,
      rejectReasons: hasBlockers ? ['PORTFOLIO_CONTEXT_INCOMPLETE'] : [],
      asOf: snapshot.snapshotTime,
    };
  }
}
