import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
@UseGuards(SessionAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  getStatus() {
    return this.portfolioService.getStatus();
  }

  @Get('snapshot')
  getSnapshot(@CurrentUser() user: AuthenticatedUser) {
    return this.portfolioService.getSnapshot(user.id);
  }

  @Post('sync/dhan')
  syncDhan(@CurrentUser() user: AuthenticatedUser) {
    return this.portfolioService.syncDhan(user.id);
  }

  @Get('holdings')
  getHoldings(@CurrentUser() user: AuthenticatedUser) {
    return this.portfolioService.getHoldings(user.id);
  }

  @Get('orders')
  getOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.portfolioService.getOrders(user.id);
  }
}
