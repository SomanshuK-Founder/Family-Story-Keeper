import {
  ChapterRepositoryError,
  type ChapterDraftRecord,
  type DrizzleChapterRepository,
} from '@story-keeper/database';

import { StoryKeeperError } from './errors.js';

export type RequestChapterDraftResult =
  | {
      readonly status: 'queued';
      readonly chapterDraftId: string;
      readonly jobId: string;
      readonly sourceCount: number;
    }
  | {
      readonly status: 'insufficient_sources';
      readonly chapterDraftId: null;
      readonly jobId: null;
      readonly sourceCount: number;
    };

export interface ReviewChapterResult {
  readonly chapterDraftId: string;
  readonly narratorPersonId: string;
  readonly chapterTopic: string;
  readonly title: string | null;
  readonly body: string | null;
  readonly status:
    'generating' | 'pending_review' | 'approved' | 'rejected' | 'failed' | 'superseded';
  readonly sources: readonly {
    readonly type: 'fact' | 'relationship' | 'timeline_event';
    readonly sourceId: string;
    readonly label: string;
    readonly summary: string;
  }[];
}

export class ChapterService {
  public constructor(
    private readonly chapters: DrizzleChapterRepository,
    private readonly jobMaxAttempts: number,
  ) {}

  public requestChapterDraft(
    familyId: string,
    actorPersonId: string,
    narratorPersonId: string,
    chapterTopic: string,
  ): RequestChapterDraftResult {
    try {
      return this.chapters.requestDraft({
        familyId,
        actorPersonId,
        narratorPersonId,
        chapterTopic,
        maxAttempts: this.jobMaxAttempts,
      });
    } catch (error: unknown) {
      throw mapChapterError(error);
    }
  }

  public reviewChapter(
    familyId: string,
    actorPersonId: string,
    chapterDraftId: string,
  ): ReviewChapterResult {
    try {
      return toReviewResult(this.chapters.reviewDraft(familyId, actorPersonId, chapterDraftId));
    } catch (error: unknown) {
      throw mapChapterError(error);
    }
  }
}

function toReviewResult(draft: ChapterDraftRecord): ReviewChapterResult {
  return {
    chapterDraftId: draft.id,
    narratorPersonId: draft.narratorPersonId,
    chapterTopic: draft.requestedTopic,
    title: draft.title,
    body: draft.body,
    status: draft.status,
    sources: draft.sources.map((source) => ({
      type: source.type,
      sourceId: source.id,
      label: source.label,
      summary: source.summary,
    })),
  };
}

function mapChapterError(error: unknown): StoryKeeperError {
  if (!(error instanceof ChapterRepositoryError)) throw error;
  return new StoryKeeperError(error.code, error.message);
}
