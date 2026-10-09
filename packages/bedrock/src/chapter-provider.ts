import type { ChapterGeneration, ChapterGenerationRequest } from '@story-keeper/shared';

export interface ChapterGenerationProvider {
  generate(request: ChapterGenerationRequest): Promise<ChapterGeneration>;
}

export class ChapterGenerationProviderError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ChapterGenerationProviderError';
  }
}
