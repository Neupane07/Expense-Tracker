import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  BrokerCredentialsService,
  type SaveDhanAppCredentialsInput,
  type SaveDhanCredentialsInput,
} from './broker-credentials.service';
import { BrokerService } from './broker.service';
import { DhanAuthService } from './dhan/dhan-auth.service';

@Controller('broker')
export class BrokerController {
  private readonly logger = new Logger(BrokerController.name);

  constructor(
    private readonly brokerService: BrokerService,
    private readonly brokerCredentials: BrokerCredentialsService,
    private readonly dhanAuth: DhanAuthService,
  ) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  getStatus() {
    return this.brokerService.getStatus();
  }

  @Get('dhan/connection')
  @UseGuards(SessionAuthGuard)
  getDhanConnection(@CurrentUser() user: AuthenticatedUser) {
    return this.brokerCredentials.getDhanConnection(user.id);
  }

  @Post('dhan/credentials')
  @UseGuards(SessionAuthGuard)
  saveDhanCredentials(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: SaveDhanCredentialsInput,
  ) {
    return this.brokerCredentials.saveDhanCredentials(user.id, input);
  }

  @Post('dhan/connect/start')
  @UseGuards(SessionAuthGuard)
  startDhanConnect(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
    @Body() input: SaveDhanAppCredentialsInput,
  ) {
    return this.dhanAuth.startConnect(user.id, response, input);
  }

  @Get('dhan/connect/callback')
  async dhanConnectCallback(
    @Req() request: Request,
    @Res() response: Response,
    @Query('tokenId') tokenId?: string,
  ) {
    if (!tokenId) {
      this.dhanAuth.redirectAfterConnect(response, 'failed');
      return;
    }

    try {
      await this.dhanAuth.completeConnect(request, response, tokenId);
      this.dhanAuth.redirectAfterConnect(response, 'success');
    } catch (error) {
      this.logger.error(
        'Dhan connect callback failed before credentials could be stored.',
        error instanceof Error ? error.stack : undefined,
      );
      this.dhanAuth.redirectAfterConnect(response, 'failed');
    }
  }

  @Post('dhan/connect/renew')
  @UseGuards(SessionAuthGuard)
  renewDhanToken(@CurrentUser() user: AuthenticatedUser) {
    return this.dhanAuth.renewAccessToken(user.id);
  }

  @Post('dhan/validate')
  @UseGuards(SessionAuthGuard)
  validateDhan(@CurrentUser() user: AuthenticatedUser) {
    return this.brokerService.validateDhan(user.id);
  }

  @Delete('dhan/credentials')
  @UseGuards(SessionAuthGuard)
  deleteDhanCredentials(@CurrentUser() user: AuthenticatedUser) {
    return this.brokerCredentials.deleteDhanCredentials(user.id);
  }
}
