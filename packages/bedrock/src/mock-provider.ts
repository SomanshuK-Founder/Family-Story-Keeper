import {
  storyExtractionSchema,
  type StoryExtraction,
  type StoryExtractionRequest,
} from '@story-keeper/shared';

import type { StoryExtractionProvider } from './provider.js';

export class MockStoryExtractionProvider implements StoryExtractionProvider {
  public readonly requests: StoryExtractionRequest[] = [];

  public constructor(private readonly result: unknown) {}

  public extract(request: StoryExtractionRequest): Promise<StoryExtraction> {
    this.requests.push(request);
    return Promise.resolve(storyExtractionSchema.parse(this.result));
  }
}
