import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TradeJournalService } from './trade-journal.service';

@Controller('trade-journal')
@UseGuards(SessionAuthGuard)
export class TradeJournalController {
  constructor(private readonly tradeJournalService: TradeJournalService) {}

  @Get()
  getStatus() {
    return this.tradeJournalService.getStatus();
  }
}
