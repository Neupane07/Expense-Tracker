import { Injectable, NotFoundException } from '@nestjs/common';
import { InstrumentVerificationService } from '../../market-data/instrument-verification.service';
import { MarketDataService } from '../../market-data/market-data.service';
import { ResearchSnapshotService } from '../../research/research-snapshot.service';
import { evaluateCandleCorporateActionPolicy } from '../corporate-action-check';
import type { ToolContext, ToolHandlerResult } from '../tool.types';
import { stockDeepDiveOutputSchema } from '../tool-output-schemas';
import { symbolInputSchema, type SymbolInput } from '../tool-schemas';

const MISSING_SECTIONS = {
  fundamentals: 'Automated fundamentals ingestion is not available.',
  licensedNews: 'Licensed/curated news ingestion is not available.',
  officialFilings: 'Official filing ingestion is not available.',
} as const;

@Injectable()
export class GetStockDeepDiveTool {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly researchSnapshots: ResearchSnapshotService,
    private readonly instrumentVerification: InstrumentVerificationService,
  ) {}

  readonly definition = {
    name: 'get_stock_deep_dive',
    version: '1',
    description:
      'Composes verified instrument, price, candle, indicator, and research outputs. Missing sections are disclosed; no invented fundamentals or news.',
    readOnly: true as const,
    inputSchema: symbolInputSchema,
    outputSchema: stockDeepDiveOutputSchema,
    handler: (context: ToolContext, input: SymbolInput) =>
      this.handle(context, input),
  };

  async handle(
    context: ToolContext,
    input: SymbolInput,
  ): Promise<ToolHandlerResult> {
    const symbol = input.symbol.trim().toUpperCase();
    const missingSections: Array<{ id: string; reason: string }> = [
      { id: 'fundamentals', reason: MISSING_SECTIONS.fundamentals },
      { id: 'licensedNews', reason: MISSING_SECTIONS.licensedNews },
      { id: 'officialFilings', reason: MISSING_SECTIONS.officialFilings },
    ];
    const warnings: string[] = [];
    const rejectReasons: string[] = [];
    const sections: Record<string, unknown> = {};

    try {
      sections.instrument = await this.marketData.getInstrument(
        context.userId,
        symbol,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        sections.instrument = null;
        rejectReasons.push('INSTRUMENT_MAPPING_MISSING');
      } else {
        throw error;
      }
    }

    try {
      sections.price = await this.marketData.getLatestPrice(
        context.userId,
        symbol,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        sections.price = null;
        rejectReasons.push('PRICE_MISSING');
      } else {
        throw error;
      }
    }

    try {
      sections.candles = await this.marketData.getCandles(
        context.userId,
        symbol,
        {},
      );
      const candleRows = Array.isArray(
        (sections.candles as { candles?: Array<{ isAdjusted?: boolean }> })
          ?.candles,
      )
        ? ((sections.candles as { candles: Array<{ isAdjusted?: boolean }> })
            .candles ?? [])
        : [];
      if (candleRows.length === 0) {
        rejectReasons.push('CANDLES_MISSING');
      }

      const corporateAction = evaluateCandleCorporateActionPolicy(
        this.instrumentVerification,
        candleRows,
      );
      sections.corporateAction = corporateAction;
      warnings.push(...corporateAction.warnings);
      blockersFromCorporateAction(corporateAction, rejectReasons);
    } catch (error) {
      if (error instanceof NotFoundException) {
        sections.candles = null;
        rejectReasons.push('CANDLES_MISSING');
      } else {
        throw error;
      }
    }

    try {
      sections.indicators = await this.marketData.getLatestIndicators(
        context.userId,
        symbol,
      );
      if (!(sections.indicators as { indicators?: unknown })?.indicators) {
        warnings.push('INDICATORS_MISSING');
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        sections.indicators = null;
        warnings.push('INDICATORS_MISSING');
      } else {
        throw error;
      }
    }

    const research = await this.researchSnapshots.getSymbolResearch(
      context.userId,
      symbol,
    );
    sections.research = research;

    if (!research.items.length) {
      missingSections.push({
        id: 'storedResearch',
        reason: 'No user-stored research evidence for this symbol.',
      });
      warnings.push('RESEARCH_EVIDENCE_MISSING');
    }

    const priceWarnings = [
      ...((sections.price as { warnings?: string[] })?.warnings ?? []),
      ...((sections.price as { price?: { warnings?: string[] } })?.price
        ?.warnings ?? []),
    ];
    warnings.push(...priceWarnings, ...research.warnings);

    const stalePrice = priceWarnings.some((warning) =>
      /STALE|MISSING/i.test(warning),
    );
    if (stalePrice) {
      rejectReasons.push('PRICE_STALE_OR_MISSING');
    }

    const status =
      sections.instrument == null
        ? 'unavailable'
        : rejectReasons.length > 0
          ? 'rejected'
          : 'ok';

    return {
      status,
      data: {
        symbol,
        sections,
        missingSections,
        researchDisclaimer:
          'Deep dive composes stored evidence and market data only. Missing sections are not inferred.',
      },
      dataQuality: research.dataQuality,
      warnings: [...new Set(warnings)],
      rejectReasons: [...new Set(rejectReasons)],
      asOf: new Date(),
    };
  }
}

function blockersFromCorporateAction(
  corporateAction: {
    blockers: string[];
    blocksHistoricalAnalysis: boolean;
  },
  rejectReasons: string[],
) {
  rejectReasons.push(...corporateAction.blockers);
  if (corporateAction.blocksHistoricalAnalysis) {
    rejectReasons.push('HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT');
  }
}
