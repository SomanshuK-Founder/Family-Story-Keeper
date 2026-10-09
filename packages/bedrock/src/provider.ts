import type { StoryExtraction, StoryExtractionRequest } from '@story-keeper/shared';

export interface StoryExtractionProvider {
  extract(request: StoryExtractionRequest): Promise<StoryExtraction>;
}

export class StoryExtractionProviderError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StoryExtractionProviderError';
  }
}
