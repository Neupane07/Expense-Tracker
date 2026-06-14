import { Module } from '@nestjs/common';
import { BrokerModule } from '../broker/broker.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { AllocationService } from './allocation.service';
import { HoldingsValuationService } from './holdings-valuation.service';
import { MutualFundsService } from './mutual-funds/mutual-funds.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioSnapshotService } from './portfolio-snapshot.service';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [BrokerModule, MarketDataModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    AllocationService,
    PortfolioSnapshotService,
    MutualFundsService,
    HoldingsValuationService,
  ],
  exports: [PortfolioService, PortfolioSnapshotService],
})
export class PortfolioModule {}
