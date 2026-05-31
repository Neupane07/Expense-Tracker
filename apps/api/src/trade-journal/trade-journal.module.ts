import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { RiskModule } from '../risk/risk.module';
import { TradeJournalController } from './trade-journal.controller';
import { TradeJournalService } from './trade-journal.service';

@Module({
  imports: [MarketDataModule, RiskModule],
  controllers: [TradeJournalController],
  providers: [TradeJournalService],
})
export class TradeJournalModule {}
