import { Injectable } from '@nestjs/common';
import { PortfolioRiskService } from './portfolio-risk.service';
import { PositionSizingService } from './position-sizing.service';
import type { PositionSizeInput, ValidateTradeInput } from './risk.dto';
import { RiskSettingsService } from './risk-settings.service';
import { TradeValidationService } from './trade-validation.service';

@Injectable()
export class RiskService {
  constructor(
    private readonly settingsService: RiskSettingsService,
    private readonly positionSizingService: PositionSizingService,
    private readonly tradeValidationService: TradeValidationService,
    private readonly portfolioRiskService: PortfolioRiskService,
  ) {}

  getStatus() {
    return {
      module: 'risk',
      status: 'deterministic',
      settings: this.settingsService.getSettings(),
    };
  }

  validateTrade(userId: string, input: ValidateTradeInput) {
    return this.tradeValidationService.validateTrade(userId, input);
  }

  async positionSize(userId: string, input: PositionSizeInput) {
    const portfolioRisk =
      await this.portfolioRiskService.getPortfolioRisk(userId);

    return this.positionSizingService.calculate({
      ...input,
      availableCash: input.availableCash ?? portfolioRisk.cash,
      totalPortfolioValue:
        input.totalPortfolioValue ?? portfolioRisk.totalPortfolioValue,
    });
  }

  getPortfolioRisk(userId: string) {
    return this.portfolioRiskService.getPortfolioRisk(userId);
  }
}
