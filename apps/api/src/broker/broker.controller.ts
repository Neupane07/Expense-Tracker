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
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthService } from '../auth/auth.service';
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
    private readonly authService: AuthService,
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
    if (!tokenId?.trim()) {
      this.dhanAuth.redirectAfterConnect(response, 'failed', 'missing_token');
      return;
    }

    const user = await this.authService.authenticateRequest(request);
    if (!user) {
      this.logger.warn(
        'Dhan connect callback received tokenId without an authenticated Finance OS session.',
      );
      this.dhanAuth.redirectAfterConnect(
        response,
        'failed',
        'session_required',
      );
      return;
    }

    try {
      await this.dhanAuth.completeConnectForUser(user.id, tokenId.trim());
      this.dhanAuth.redirectAfterConnect(response, 'success');
    } catch (error) {
      this.logger.error(
        'Dhan connect callback failed before credentials could be stored.',
        error instanceof Error ? error.stack : undefined,
      );
      const reason =
        error instanceof Error && error.message.includes('token exchange')
          ? 'token_exchange_failed'
          : 'connect_failed';
      this.dhanAuth.redirectAfterConnect(response, 'failed', reason);
    }
  }

  @Post('dhan/connect/manual-token')
  @UseGuards(SessionAuthGuard)
  async saveManualDhanToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    input: { accessToken?: string; accessTokenExpiresAt?: string | null },
  ) {
    const accessToken = input.accessToken?.trim();
    if (!accessToken) {
      throw new BadRequestException('accessToken is required.');
    }

    await this.brokerCredentials.saveDhanAccessToken(user.id, {
      accessToken,
      accessTokenExpiresAt: input.accessTokenExpiresAt
        ? new Date(input.accessTokenExpiresAt)
        : new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return this.brokerCredentials.getDhanConnection(user.id);
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
