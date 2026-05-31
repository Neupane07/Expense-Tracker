import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { RiskModule } from '../risk/risk.module';
import { ScannerService } from './scanner.service';
import { SwingScannerController } from './swing-scanner.controller';
import { SwingScannerService } from './swing-scanner.service';

@Module({
  imports: [MarketDataModule, RiskModule],
  controllers: [SwingScannerController],
  providers: [ScannerService, SwingScannerService],
})
export class ScannerModule {}
