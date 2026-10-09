import {
  ChapterGenerationProviderError,
  type ChapterGenerationProvider,
} from '@story-keeper/bedrock';
import {
  ChapterRepositoryError,
  type DrizzleChapterRepository,
  type DrizzleJobRepository,
} from '@story-keeper/database';
import { chapterGenerationSchema } from '@story-keeper/shared';
import { ZodError } from 'zod';

export type ChapterWorkerProcessResult = 'idle' | 'succeeded' | 'retrying' | 'failed';

export interface ChapterWorkerOptions {
  readonly workerId: string;
  readonly retryDelayMs: number;
}

export class ChapterWorker {
  public constructor(
    private readonly jobs: DrizzleJobRepository,
    private readonly chapters: DrizzleChapterRepository,
    private readonly provider: ChapterGenerationProvider,
    private readonly options: ChapterWorkerOptions,
  ) {}

  public async processNext(now = new Date()): Promise<ChapterWorkerProcessResult> {
    const job = this.jobs.claimNext(this.options.workerId, now, 'draft_chapter');
    if (job === undefined) return 'idle';

    try {
      const request = this.chapters.loadGenerationRequest(
        job.familyId,
        job.payload.chapterDraftId,
        job.id,
        job.payload.sources,
      );
      if (request === undefined) throw new PermanentChapterError('CHAPTER_DRAFT_MISSING');
      const chapter = chapterGenerationSchema.parse(await this.provider.generate(request));
      this.chapters.publishDraft({
        familyId: job.familyId,
        chapterDraftId: job.payload.chapterDraftId,
        jobId: job.id,
        workerId: this.options.workerId,
        allowedSources: job.payload.sources,
        chapter,
        publishedAt: now,
      });
      return 'succeeded';
    } catch (error: unknown) {
      const failure = classifyChapterFailure(error);
      const updated = this.jobs.recordFailure(
        job.id,
        this.options.workerId,
        failure,
        this.options.retryDelayMs,
        now,
      );
      if (updated.status === 'failed') {
        this.chapters.markFailed(job.familyId, job.payload.chapterDraftId, job.id, now);
      }
      return updated.status === 'queued' ? 'retrying' : 'failed';
    }
  }
}

export interface ChapterWorkerLoop {
  stop(): Promise<void>;
}

export function startChapterWorkerLoop(
  worker: ChapterWorker,
  jobs: DrizzleJobRepository,
  options: { readonly pollIntervalMs: number; readonly lockTimeoutMs: number },
): ChapterWorkerLoop {
  let activePoll: Promise<void> | undefined;
  jobs.recoverStaleJobs(new Date(Date.now() - options.lockTimeoutMs));

  const poll = async (): Promise<void> => {
    if (activePoll !== undefined) return activePoll;
    activePoll = (async () => {
      try {
        await worker.processNext();
      } catch (error: unknown) {
        console.error(
          JSON.stringify({
            level: 'error',
            operation: 'chapter_worker.poll',
            errorCategory: error instanceof Error ? error.name : 'UnknownError',
          }),
        );
      }
    })();
    try {
      await activePoll;
    } finally {
      activePoll = undefined;
    }
  };
  const timer = setInterval(() => void poll(), options.pollIntervalMs);
  void poll();
  return {
    stop: async (): Promise<void> => {
      clearInterval(timer);
      await activePoll;
    },
  };
}

class PermanentChapterError extends Error {
  public constructor(public readonly code: string) {
    super('The chapter job cannot be completed.');
    this.name = 'PermanentChapterError';
  }
}

function classifyChapterFailure(error: unknown) {
  if (error instanceof ChapterGenerationProviderError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof PermanentChapterError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof ZodError) {
    return {
      code: 'INVALID_CHAPTER_OUTPUT',
      message: 'The chapter output failed validation.',
      retryable: false,
    };
  }
  if (error instanceof ChapterRepositoryError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  return {
    code: 'CHAPTER_PROCESSING_FAILED',
    message: 'The chapter could not be published.',
    retryable: false,
  };
}
