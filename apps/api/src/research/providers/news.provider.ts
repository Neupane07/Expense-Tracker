import { Injectable, Logger } from '@nestjs/common';
import type {
  ResearchProvider,
  ResearchProviderInput,
} from './research-provider.interface';

/**
 * Placeholder for curated news ingestion.
 * TODO: wire a licensed or official news feed; do not scrape fragile sources.
 */
@Injectable()
export class NewsProvider implements ResearchProvider {
  private readonly logger = new Logger(NewsProvider.name);

  readonly providerId = 'news';

  canHandle(input: ResearchProviderInput) {
    return input.sourceType.trim().toUpperCase() === 'NEWS_FEED';
  }

  prepareItem(input: ResearchProviderInput): never {
    void input;
    this.logger.warn(
      'NewsProvider is not implemented; use manual URL evidence.',
    );

    throw new Error(
      'News provider is not available yet. Add user-provided URL research items instead.',
    );
  }
}
