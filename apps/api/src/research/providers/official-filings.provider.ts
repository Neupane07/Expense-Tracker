import { Injectable, Logger } from '@nestjs/common';
import type {
  ResearchProvider,
  ResearchProviderInput,
} from './research-provider.interface';

/**
 * Placeholder for official NSE/BSE filing ingestion.
 * TODO: integrate reliable exchange filing APIs when available.
 */
@Injectable()
export class OfficialFilingsProvider implements ResearchProvider {
  private readonly logger = new Logger(OfficialFilingsProvider.name);

  readonly providerId = 'official-filings';

  canHandle(input: ResearchProviderInput) {
    return input.sourceType.trim().toUpperCase() === 'OFFICIAL_FILING';
  }

  prepareItem(input: ResearchProviderInput): never {
    void input;
    this.logger.warn(
      'OfficialFilingsProvider is not implemented; use manual evidence entry.',
    );

    throw new Error(
      'Official filing provider is not available yet. Add manual research items instead.',
    );
  }
}
