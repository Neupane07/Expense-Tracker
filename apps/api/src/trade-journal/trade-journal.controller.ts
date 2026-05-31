import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  createEntrySchema,
  fromScannerCandidateSchema,
  listEntriesQuerySchema,
  updateEntrySchema,
  type CreateEntryInput,
  type FromScannerCandidateInput,
  type ListEntriesQuery,
  type UpdateEntryInput,
} from './trade-journal.dto';
import { TradeJournalService } from './trade-journal.service';

@Controller('trade-journal')
@UseGuards(SessionAuthGuard)
export class TradeJournalController {
  constructor(private readonly tradeJournalService: TradeJournalService) {}

  @Get()
  getStatus() {
    return this.tradeJournalService.getStatus();
  }

  @Get('entries')
  listEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.tradeJournalService.listEntries(user.id, parseListQuery(query));
  }

  @Post('entries/from-scanner-candidate')
  createFromScannerCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.tradeJournalService.createFromScannerCandidate(
      user.id,
      parseFromScannerCandidate(body),
    );
  }

  @Post('entries')
  createEntry(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.tradeJournalService.createEntry(
      user.id,
      parseCreateEntry(body),
    );
  }

  @Get('entries/:id')
  getEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tradeJournalService.getEntry(user.id, id);
  }

  @Patch('entries/:id')
  updateEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.tradeJournalService.updateEntry(
      user.id,
      id,
      parseUpdateEntry(body),
    );
  }

  @Delete('entries/:id')
  deleteEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tradeJournalService.deleteEntry(user.id, id);
  }
}

function parseListQuery(
  query: Record<string, string | undefined>,
): ListEntriesQuery {
  const parsed = listEntriesQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid trade journal list query',
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}

function parseCreateEntry(body: unknown): CreateEntryInput {
  const parsed = createEntrySchema.safeParse(body);

  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid trade journal entry input',
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}

function parseUpdateEntry(body: unknown): UpdateEntryInput {
  const parsed = updateEntrySchema.safeParse(body);

  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid trade journal update input',
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}

function parseFromScannerCandidate(body: unknown): FromScannerCandidateInput {
  const parsed = fromScannerCandidateSchema.safeParse(body);

  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid from-scanner candidate input',
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}
