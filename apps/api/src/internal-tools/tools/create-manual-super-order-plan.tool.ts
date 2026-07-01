import { Injectable } from '@nestjs/common';
import type { ValidateTradeInput } from '../../risk/risk.dto';
import { TradeValidationService } from '../../risk/trade-validation.service';
import { throwIfAborted } from '../tool-abort';
import type { ToolContext, ToolHandlerResult } from '../tool.types';
import { manualSuperOrderPlanOutputSchema } from '../tool-output-schemas';
import { createManualSuperOrderPlanInputSchema } from '../tool-schemas';

const MANUAL_PLACEMENT_DISCLAIMER =
  'Manual Super Order parameters only. Finance OS does not place, modify, or cancel broker orders.';

@Injectable()
export class CreateManualSuperOrderPlanTool {
  constructor(private readonly tradeValidation: TradeValidationService) {}

  readonly definition = {
    name: 'create_manual_super_order_plan',
    version: '1',
    description:
      'Formats BUY/DELIVERY/DAY Super Order parameters after shared validation. No Dhan order call.',
    readOnly: true as const,
    inputSchema: createManualSuperOrderPlanInputSchema,
    outputSchema: manualSuperOrderPlanOutputSchema,
    handler: (context: ToolContext, input: ValidateTradeInput) =>
      this.handle(context, input),
  };

  async handle(
    context: ToolContext,
    input: ValidateTradeInput,
  ): Promise<ToolHandlerResult> {
    throwIfAborted(context.abortSignal);
    const validation = await this.tradeValidation.validateTrade(
      context.userId,
      input,
    );
    throwIfAborted(context.abortSignal);

    if (!validation.valid) {
      return {
        status: 'rejected',
        data: {
          plan: null,
          validation,
          disclaimer: MANUAL_PLACEMENT_DISCLAIMER,
        },
        dataQuality: validation.dataQuality,
        warnings: validation.warnings,
        rejectReasons: validation.rejectReasons,
        asOf: validation.dataQuality.asOf,
        errorCode: 'VALIDATION_REJECTED',
      };
    }

    return {
      status: 'ok',
      data: {
        plan: {
          side: 'BUY' as const,
          product: 'DELIVERY' as const,
          validity: 'DAY' as const,
          symbol: validation.symbol,
          quantity: validation.quantity,
          limitPrice: validation.entry,
          targetPrice: validation.target,
          stopLossPrice: validation.stopLoss,
        },
        validation,
        disclaimer: MANUAL_PLACEMENT_DISCLAIMER,
      },
      dataQuality: validation.dataQuality,
      warnings: validation.warnings,
      rejectReasons: [],
      asOf: validation.dataQuality.asOf,
    };
  }
}
