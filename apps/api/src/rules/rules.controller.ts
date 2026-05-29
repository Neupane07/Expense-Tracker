import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RulesService } from './rules.service';
import type { CreateRuleInput, UpdateRuleInput } from './rules.service';

@Controller('rules')
@UseGuards(SessionAuthGuard)
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.rulesService.findAll(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rulesService.findOne(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateRuleInput,
  ) {
    return this.rulesService.create(user.id, input);
  }

  @Post('defaults')
  createDefaults(@CurrentUser() user: AuthenticatedUser) {
    return this.rulesService.createDefaults(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: UpdateRuleInput,
  ) {
    return this.rulesService.update(user.id, id, input);
  }

  @Post(':id/apply')
  apply(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rulesService.apply(user.id, id);
  }
}
