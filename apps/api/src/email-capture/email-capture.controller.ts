import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { GmailService } from './gmail.service';
import { SourceDocumentsService } from './source-documents.service';
@Controller('email-connections')
@UseGuards(SessionAuthGuard)
export class EmailConnectionsController {
  constructor(
    private readonly gmail: GmailService,
    private readonly config: ConfigService,
  ) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.gmail.list(user.id);
  }
  @Post('connect') start(@CurrentUser() user: AuthenticatedUser) {
    return this.gmail.start(user.id);
  }
  @Get('callback') async callback(
    @CurrentUser() user: AuthenticatedUser,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() response: Response,
  ) {
    await this.gmail.callback(user.id, code, state);
    response.redirect(
      `${this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173'}/email`,
    );
  }
  @Patch(':id') action(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.gmail.action(user.id, id, body);
  }
  @Post(':id/backfill') backfill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.gmail.backfill(user.id, id, body);
  }
}
@Controller('source-documents')
@UseGuards(SessionAuthGuard)
export class SourceDocumentsController {
  constructor(private readonly documents: SourceDocumentsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.documents.list(user.id, query);
  }
  @Get(':id') detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documents.detail(user.id, id);
  }
  @Get(':id/download') async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const raw = await this.documents.raw(user.id, id);
    return new StreamableFile(raw.bytes, {
      type: 'application/octet-stream',
      disposition: 'attachment; filename="source-document"',
    });
  }
  @Post(':id/map') map(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.documents.map(user.id, id, body);
  }
  @Post(':id/password') password(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.documents.password(user.id, id, body);
  }
  @Post(':id/retry') retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documents.process(user.id, id);
  }
  @Post(':id/post') post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documents.post(user.id, id);
  }
  @Post(':id/observations/:observationId/resolve') resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('observationId') observationId: string,
    @Body() body: unknown,
  ) {
    return this.documents.resolve(user.id, id, observationId, body);
  }
  @Delete(':id') remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.documents.remove(user.id, id);
  }
}
