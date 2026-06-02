import { Injectable } from '@nestjs/common';
import type {
  ResearchProvider,
  ResearchProviderInput,
  ResearchProviderResult,
} from './research-provider.interface';

@Injectable()
export class ManualResearchProvider implements ResearchProvider {
  readonly providerId = 'manual';

  canHandle(input: ResearchProviderInput) {
    const sourceType = input.sourceType.trim().toUpperCase();

    return sourceType !== 'OFFICIAL_FILING' && sourceType !== 'NEWS_FEED';
  }

  prepareItem(input: ResearchProviderInput): ResearchProviderResult {
    return {
      title: input.title.trim(),
      summary: input.summary.trim(),
      sourceType: input.sourceType.trim().toUpperCase(),
      sourceName: input.sourceName.trim(),
      sourceUrl: input.sourceUrl ?? null,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      fetchedAt: new Date(),
      confidence: 0.85,
      rawPayload: {
        provider: this.providerId,
        userProvided: true,
      },
    };
  }
}
