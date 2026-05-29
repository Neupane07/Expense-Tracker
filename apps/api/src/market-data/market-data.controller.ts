import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
@UseGuards(SessionAuthGuard)
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get()
  getStatus() {
    return this.marketDataService.getStatus();
  }
}
