import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { ActiveTradeService } from './active-trade.service';
import { ExposureService } from './exposure.service';
import { PortfolioRiskService } from './portfolio-risk.service';
import { PositionSizingService } from './position-sizing.service';
import { RiskController } from './risk.controller';
import { RiskSettingsService } from './risk-settings.service';
import { RiskService } from './risk.service';
import { TradeValidationService } from './trade-validation.service';

@Module({
  imports: [MarketDataModule],
  controllers: [RiskController],
  providers: [
    RiskService,
    RiskSettingsService,
    PositionSizingService,
    TradeValidationService,
    PortfolioRiskService,
    ActiveTradeService,
    ExposureService,
  ],
  exports: [TradeValidationService, ExposureService, RiskSettingsService, ActiveTradeService],
})
export class RiskModule {}
