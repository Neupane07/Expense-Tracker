import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminGuard } from './admin.guard';
import { InviteRequiredException } from './auth.errors';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { SessionAuthGuard } from './session-auth.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Get('google')
  google(@Res() response: Response) {
    this.authService.startGoogleSignIn(response);
  }

  @Get('google/callback')
  async callback(
    @Req() request: Request,
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    if (error) {
      response.redirect(
        `${this.authService.frontendUrl()}/sign-in?error=cancelled`,
      );
      return;
    }

    try {
      await this.authService.finishGoogleSignIn(request, response, code, state);
      response.redirect(`${this.authService.frontendUrl()}/dashboard`);
    } catch (caught: unknown) {
      if (caught instanceof InviteRequiredException) {
        response.redirect(
          `${this.authService.frontendUrl()}/sign-in?error=invite_required`,
        );
        return;
      }

      this.logger.error(
        'Google callback failed before a session could be established.',
        caught instanceof Error ? caught.stack : undefined,
      );
      response.redirect(
        `${this.authService.frontendUrl()}/sign-in?error=sign_in_failed`,
      );
    }
  }

  @Get('session')
  async session(@Req() request: Request) {
    const user = await this.authService.authenticateRequest(request);
    return user ? { authenticated: true, user } : { authenticated: false };
  }

  @Post('sign-out')
  async signOut(@Req() request: Request, @Res() response: Response) {
    await this.authService.signOut(request, response);
    response.status(204).send();
  }

  @Get('invitations')
  @UseGuards(SessionAuthGuard, AdminGuard)
  findInvitations() {
    return this.authService.findInvitations();
  }

  @Post('invitations')
  @UseGuards(SessionAuthGuard, AdminGuard)
  createInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: { email?: string; role?: string },
  ) {
    return this.authService.createInvitation(user, input);
  }

  @Delete('invitations/:id')
  @UseGuards(SessionAuthGuard, AdminGuard)
  revokeInvitation(@Param('id') id: string) {
    return this.authService.revokeInvitation(id);
  }
}
