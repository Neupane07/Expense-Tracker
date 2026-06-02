import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { ManualResearchProvider } from './providers/manual-research.provider';
import { NewsProvider } from './providers/news.provider';
import { OfficialFilingsProvider } from './providers/official-filings.provider';
import { ResearchController } from './research.controller';
import { ResearchIngestionService } from './research-ingestion.service';
import { ResearchItemsService } from './research-items.service';
import { ResearchQualityService } from './research-quality.service';
import { ResearchSnapshotService } from './research-snapshot.service';

@Module({
  imports: [MarketDataModule],
  controllers: [ResearchController],
  providers: [
    ResearchQualityService,
    ResearchItemsService,
    ResearchSnapshotService,
    ResearchIngestionService,
    ManualResearchProvider,
    OfficialFilingsProvider,
    NewsProvider,
  ],
  exports: [ResearchSnapshotService, ResearchItemsService],
})
export class ResearchModule {}
