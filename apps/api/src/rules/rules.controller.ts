import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RulesService } from './rules.service';
import type { CreateRuleInput } from './rules.service';

@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  findAll() {
    return this.rulesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rulesService.findOne(id);
  }

  @Post()
  create(@Body() input: CreateRuleInput) {
    return this.rulesService.create(input);
  }

  @Post(':id/apply')
  apply(@Param('id') id: string) {
    return this.rulesService.apply(id);
  }
}
