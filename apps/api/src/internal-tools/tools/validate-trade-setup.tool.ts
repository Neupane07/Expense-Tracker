import { Injectable } from '@nestjs/common';
import type { ValidateTradeInput } from '../../risk/risk.dto';
import { TradeValidationService } from '../../risk/trade-validation.service';
import { throwIfAborted } from '../tool-abort';
import type { ToolContext, ToolHandlerResult } from '../tool.types';
import { tradeValidationOutputSchema } from '../tool-output-schemas';
import { validateTradeSetupInputSchema } from '../tool-schemas';

@Injectable()
export class ValidateTradeSetupTool {
  constructor(private readonly tradeValidation: TradeValidationService) {}

  readonly definition = {
    name: 'validate_trade_setup',
    version: '1',
    description:
      'Deterministic BUY/DELIVERY trade validation using shared risk engine (no broker calls).',
    readOnly: true as const,
    inputSchema: validateTradeSetupInputSchema,
    outputSchema: tradeValidationOutputSchema,
    handler: (context: ToolContext, input: ValidateTradeInput) =>
      this.handle(context, input),
  };

  async handle(
    context: ToolContext,
    input: ValidateTradeInput,
  ): Promise<ToolHandlerResult> {
    throwIfAborted(context.abortSignal);
    const result = await this.tradeValidation.validateTrade(
      context.userId,
      input,
    );
    throwIfAborted(context.abortSignal);

    return {
      status: result.valid ? 'ok' : 'rejected',
      data: result,
      dataQuality: result.dataQuality,
      warnings: result.warnings,
      rejectReasons: result.rejectReasons,
      asOf: result.dataQuality.asOf,
    };
  }
}
