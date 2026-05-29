import { Module } from '@nestjs/common';
import { TradeJournalController } from './trade-journal.controller';
import { TradeJournalService } from './trade-journal.service';

@Module({
  controllers: [TradeJournalController],
  providers: [TradeJournalService],
})
export class TradeJournalModule {}
