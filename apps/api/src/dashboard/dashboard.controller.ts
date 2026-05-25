import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@Query('month') month?: string) {
    return this.dashboardService.getSummary(month);
  }

  @Get('charts')
  getCharts() {
    return this.dashboardService.getCharts();
  }
}
