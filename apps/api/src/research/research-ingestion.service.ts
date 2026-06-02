import { BadRequestException, Injectable } from '@nestjs/common';
import { InstrumentsService } from '../market-data/instruments.service';
import type { CreateResearchItemInput } from './research.dto';
import { ResearchItemsService } from './research-items.service';
import { ManualResearchProvider } from './providers/manual-research.provider';
import { NewsProvider } from './providers/news.provider';
import { OfficialFilingsProvider } from './providers/official-filings.provider';
import type { ResearchProvider } from './providers/research-provider.interface';
import { ResearchSnapshotService } from './research-snapshot.service';

@Injectable()
export class ResearchIngestionService {
  private readonly providers: ResearchProvider[];

  constructor(
    private readonly items: ResearchItemsService,
    private readonly snapshots: ResearchSnapshotService,
    private readonly instruments: InstrumentsService,
    manualProvider: ManualResearchProvider,
    officialFilingsProvider: OfficialFilingsProvider,
    newsProvider: NewsProvider,
  ) {
    this.providers = [officialFilingsProvider, newsProvider, manualProvider];
  }

  async addManualNote(userId: string, input: CreateResearchItemInput) {
    return this.createUserResearchItem(userId, {
      ...input,
      category: input.category ?? 'USER_NOTE',
      sourceType: input.sourceType || 'MANUAL',
    });
  }

  async createUserResearchItem(userId: string, input: CreateResearchItemInput) {
    this.assertUserIngestibleSourceType(input.sourceType);
    const provider = this.resolveProvider(input);
    const prepared = await provider.prepareItem(input);
    const instrument = await this.tryResolveInstrument(userId, input.symbol);

    const item = await this.items.createItem(userId, input, {
      instrumentId: instrument?.id ?? null,
      prepared: {
        ...prepared,
        rawPayload: prepared.rawPayload ?? undefined,
      },
    });

    await this.snapshots.regenerateSnapshot(
      userId,
      input.symbol,
      instrument?.id ?? null,
    );

    return item;
  }

  private assertUserIngestibleSourceType(sourceType: string) {
    const normalized = sourceType.trim().toUpperCase();

    if (normalized === 'OFFICIAL_FILING' || normalized === 'NEWS_FEED') {
      throw new BadRequestException(
        'Automated official filing and news ingestion is not available yet. Use MANUAL, USER_NOTE, or USER_URL for user-entered evidence.',
      );
    }
  }

  private resolveProvider(input: CreateResearchItemInput) {
    const provider = this.providers.find((candidate) =>
      candidate.canHandle(input),
    );

    if (!provider) {
      throw new BadRequestException(
        `Unsupported research sourceType: ${input.sourceType}`,
      );
    }

    return provider;
  }

  private async tryResolveInstrument(userId: string, symbol: string) {
    try {
      return await this.instruments.findBySymbol(userId, symbol);
    } catch {
      return null;
    }
  }
}
