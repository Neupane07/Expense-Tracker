import type {
  CreateResearchItemInput,
  ResearchEvidenceInput,
} from '../research.dto';

export type ResearchProviderInput = CreateResearchItemInput & {
  evidence?: ResearchEvidenceInput[];
};

export type ResearchProviderResult = {
  title: string;
  summary: string;
  sourceType: string;
  sourceName: string;
  sourceUrl?: string | null;
  publishedAt?: Date | null;
  fetchedAt: Date;
  confidence: number;
  rawPayload?: Record<string, unknown> | null;
};

export interface ResearchProvider {
  readonly providerId: string;
  canHandle(input: ResearchProviderInput): boolean;
  prepareItem(
    input: ResearchProviderInput,
  ): Promise<ResearchProviderResult> | ResearchProviderResult;
}
