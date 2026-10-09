import {
  chapterGenerationSchema,
  type ChapterGeneration,
  type ChapterGenerationRequest,
} from '@story-keeper/shared';

import type { ChapterGenerationProvider } from './chapter-provider.js';

export class MockChapterGenerationProvider implements ChapterGenerationProvider {
  public readonly requests: ChapterGenerationRequest[] = [];

  public constructor(private readonly result: unknown) {}

  public generate(request: ChapterGenerationRequest): Promise<ChapterGeneration> {
    this.requests.push(request);
    return Promise.resolve(chapterGenerationSchema.parse(this.result));
  }
}
