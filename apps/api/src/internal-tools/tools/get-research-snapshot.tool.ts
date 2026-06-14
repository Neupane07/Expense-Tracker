import { Injectable } from '@nestjs/common';
import { ResearchSnapshotService } from '../../research/research-snapshot.service';
import type { ToolContext, ToolHandlerResult } from '../tool.types';
import { researchSnapshotOutputSchema } from '../tool-output-schemas';
import { symbolInputSchema, type SymbolInput } from '../tool-schemas';

@Injectable()
export class GetResearchSnapshotTool {
  constructor(private readonly researchSnapshots: ResearchSnapshotService) {}

  readonly definition = {
    name: 'get_research_snapshot',
    version: '1',
    description:
      'Deterministic per-symbol research rollup from user-stored evidence only.',
    readOnly: true as const,
    inputSchema: symbolInputSchema,
    outputSchema: researchSnapshotOutputSchema,
    handler: (context: ToolContext, input: SymbolInput) =>
      this.handle(context, input),
  };

  async handle(
    context: ToolContext,
    input: SymbolInput,
  ): Promise<ToolHandlerResult> {
    const symbol = input.symbol.trim().toUpperCase();
    const research = await this.researchSnapshots.getSymbolResearch(
      context.userId,
      symbol,
    );
    const missing = research.items.length === 0;

    return {
      status: missing ? 'unavailable' : 'ok',
      data: research,
      dataQuality: research.dataQuality,
      warnings: research.warnings,
      rejectReasons: missing ? ['RESEARCH_EVIDENCE_MISSING'] : [],
      asOf: research.researchSnapshot?.asOf ?? new Date(),
    };
  }
}
