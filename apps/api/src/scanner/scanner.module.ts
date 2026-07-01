import { Module } from '@nestjs/common';
import { BrokerModule } from '../broker/broker.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { ResearchModule } from '../research/research.module';
import { RiskModule } from '../risk/risk.module';
import { ScannerReadinessService } from './scanner-readiness.service';
import { ScannerService } from './scanner.service';
import { SwingScannerController } from './swing-scanner.controller';
import { SwingScannerService } from './swing-scanner.service';

@Module({
  imports: [BrokerModule, MarketDataModule, RiskModule, ResearchModule],
  controllers: [SwingScannerController],
  providers: [ScannerService, SwingScannerService, ScannerReadinessService],
  exports: [SwingScannerService, ScannerReadinessService],
})
export class ScannerModule {}
