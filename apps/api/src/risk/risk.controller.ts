import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RiskService } from './risk.service';

@Controller('risk')
@UseGuards(SessionAuthGuard)
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get()
  getStatus() {
    return this.riskService.getStatus();
  }
}
