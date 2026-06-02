import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  createResearchItemSchema,
  listResearchItemsQuerySchema,
  type CreateResearchItemInput,
  type ListResearchItemsQuery,
} from './research.dto';
import { ResearchIngestionService } from './research-ingestion.service';
import { ResearchItemsService } from './research-items.service';
import { ResearchSnapshotService } from './research-snapshot.service';

const RESEARCH_DISCLAIMER =
  'Research only — stored user evidence. No automated trading.';

@Controller('research')
@UseGuards(SessionAuthGuard)
export class ResearchController {
  constructor(
    private readonly items: ResearchItemsService,
    private readonly ingestion: ResearchIngestionService,
    private readonly snapshots: ResearchSnapshotService,
  ) {}

  @Get()
  getStatus() {
    return {
      module: 'research',
      status: 'active',
      disclaimer: RESEARCH_DISCLAIMER,
    };
  }

  @Get('items')
  listItems(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.items.listItems(user.id, parseListQuery(query));
  }

  @Post('items')
  createItem(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.ingestion.createUserResearchItem(
      user.id,
      parseCreateItem(body),
    );
  }

  @Delete('items/:id')
  async deleteItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const result = await this.items.deleteItem(user.id, id);
    await this.snapshots.regenerateSnapshot(user.id, result.symbol);

    return result;
  }

  @Get(':symbol')
  getSymbolResearch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.snapshots.getSymbolResearch(user.id, symbol);
  }

  @Post(':symbol/snapshot')
  regenerateSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('symbol') symbol: string,
  ) {
    return this.snapshots.regenerateSnapshot(user.id, symbol);
  }
}

function parseListQuery(
  query: Record<string, string | undefined>,
): ListResearchItemsQuery {
  const parsed = listResearchItemsQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid research list query',
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}

function parseCreateItem(body: unknown): CreateResearchItemInput {
  const parsed = createResearchItemSchema.safeParse(body);

  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid research item input',
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}
