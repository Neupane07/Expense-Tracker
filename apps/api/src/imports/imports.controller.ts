import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ImportsService } from './imports.service';

@Controller('imports')
@UseGuards(SessionAuthGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('sourceType') sourceType: string,
    @Body('accountId') accountId: string,
  ) {
    return this.importsService.preview(user.id, {
      file,
      sourceType,
      accountId,
    });
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('sourceType') sourceType: string,
    @Body('accountId') accountId: string,
  ) {
    return this.importsService.create(user.id, {
      file,
      sourceType,
      accountId,
    });
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.importsService.findAll(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.importsService.findOne(user.id, id);
  }
}
