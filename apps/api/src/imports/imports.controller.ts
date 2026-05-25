import { Controller, Get, Param } from '@nestjs/common';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get()
  findAll() {
    return this.importsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.importsService.findOne(id);
  }
}
