import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('sourceType') sourceType: string,
    @Body('accountId') accountId: string,
  ) {
    return this.importsService.preview({
      file,
      sourceType,
      accountId,
    });
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('sourceType') sourceType: string,
    @Body('accountId') accountId: string,
  ) {
    return this.importsService.create({
      file,
      sourceType,
      accountId,
    });
  }

  @Get()
  findAll() {
    return this.importsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.importsService.findOne(id);
  }
}
