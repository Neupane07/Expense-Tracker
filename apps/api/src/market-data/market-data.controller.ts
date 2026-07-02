import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
@UseGuards(SessionAuthGuard)
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get()
  getStatus() {
    return this.marketDataService.getStatus();
  }

  @Get('instrument-master/status')
  getInstrumentMasterStatus() {
    return this.marketDataService.getInstrumentMasterStatus();
  }

  @Post('sync/instrument-master')
  @UseGuards(AdminGuard)
  syncInstrumentMaster(@Query('force') force?: string) {
    return this.marketDataService.syncInstrumentMaster({
      force: force === 'true',
    });
  }

  @Get('instruments/:symbol')
  getInstrument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.marketDataService.getInstrument(user.id, symbol);
  }

  @Get('prices/:symbol/latest')
  getLatestPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.marketDataService.getLatestPrice(user.id, symbol);
  }

  @Get('candles/:symbol')
  getCandles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.marketDataService.getCandles(user.id, symbol, { from, to });
  }

  @Get('indicators/:symbol/latest')
  getLatestIndicators(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.marketDataService.getLatestIndicators(user.id, symbol);
  }

  @Post('indicators/recalculate/:symbol')
  recalculateIndicators(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.marketDataService.recalculateIndicators(user.id, symbol);
  }
}
