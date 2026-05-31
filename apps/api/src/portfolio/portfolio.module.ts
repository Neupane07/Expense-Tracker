import { Module } from '@nestjs/common';
import { BrokerModule } from '../broker/broker.module';
import { AllocationService } from './allocation.service';
import { MutualFundsService } from './mutual-funds/mutual-funds.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioSnapshotService } from './portfolio-snapshot.service';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [BrokerModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    AllocationService,
    PortfolioSnapshotService,
    MutualFundsService,
  ],
})
export class PortfolioModule {}
