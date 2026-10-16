import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { DashboardPeriodInput } from './dashboard.service';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(SessionAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() period: DashboardPeriodInput,
  ) {
    return this.dashboardService.getSummary(user.id, period);
  }

  @Get('charts')
  getCharts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() period: DashboardPeriodInput,
  ) {
    return this.dashboardService.getCharts(user.id, period);
  }
}
