import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { BrokerService } from './broker.service';

@Controller('broker')
@UseGuards(SessionAuthGuard)
export class BrokerController {
  constructor(private readonly brokerService: BrokerService) {}

  @Get()
  getStatus() {
    return this.brokerService.getStatus();
  }
}
