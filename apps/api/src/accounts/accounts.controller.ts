import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AccountsService } from './accounts.service';
import type { CreateAccountInput } from './accounts.service';

@Controller('accounts')
@UseGuards(SessionAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.accountsService.findAll(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateAccountInput,
  ) {
    return this.accountsService.create(user.id, input);
  }
}
