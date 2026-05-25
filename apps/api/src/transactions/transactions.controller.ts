import { Controller, Get, Param, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import type { TransactionFilters } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  findAll(@Query() filters: TransactionFilters) {
    return this.transactionsService.findAll(filters);
  }

  @Get('review')
  findReviewQueue() {
    return this.transactionsService.findReviewQueue();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }
}
