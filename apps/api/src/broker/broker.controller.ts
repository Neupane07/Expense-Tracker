import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  BrokerCredentialsService,
  type SaveDhanCredentialsInput,
} from './broker-credentials.service';
import { BrokerService } from './broker.service';

@Controller('broker')
@UseGuards(SessionAuthGuard)
export class BrokerController {
  constructor(
    private readonly brokerService: BrokerService,
    private readonly brokerCredentials: BrokerCredentialsService,
  ) {}

  @Get()
  getStatus() {
    return this.brokerService.getStatus();
  }

  @Get('dhan/connection')
  getDhanConnection(@CurrentUser() user: AuthenticatedUser) {
    return this.brokerCredentials.getDhanConnection(user.id);
  }

  @Post('dhan/credentials')
  saveDhanCredentials(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: SaveDhanCredentialsInput,
  ) {
    return this.brokerCredentials.saveDhanCredentials(user.id, input);
  }

  @Post('dhan/validate')
  validateDhan(@CurrentUser() user: AuthenticatedUser) {
    return this.brokerService.validateDhan(user.id);
  }

  @Delete('dhan/credentials')
  deleteDhanCredentials(@CurrentUser() user: AuthenticatedUser) {
    return this.brokerCredentials.deleteDhanCredentials(user.id);
  }
}
