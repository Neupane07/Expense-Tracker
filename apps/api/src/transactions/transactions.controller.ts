import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TransactionsService } from './transactions.service';
import type {
  UpdateTransactionCategoryInput,
  TransactionFilters,
} from './transactions.service';

@Controller('transactions')
@UseGuards(SessionAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: TransactionFilters,
  ) {
    return this.transactionsService.findAll(user.id, filters);
  }

  @Get('review')
  findReviewQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.transactionsService.findReviewQueue(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transactionsService.findOne(user.id, id);
  }

  @Patch(':id/category')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: UpdateTransactionCategoryInput,
  ) {
    return this.transactionsService.updateCategory(user.id, id, input);
  }
}
