import { StoryExtractionProviderError, type StoryExtractionProvider } from '@story-keeper/bedrock';
import type {
  DrizzleExtractionRepository,
  DrizzleJobRepository,
  DrizzleStoryMemoryRepository,
} from '@story-keeper/database';
import { storyExtractionSchema } from '@story-keeper/shared';
import { ZodError } from 'zod';

import { ExtractionNormalizationError, normalizeExtraction } from './extraction-normalizer.js';

export type WorkerProcessResult = 'idle' | 'succeeded' | 'retrying' | 'failed';

export interface ExtractionWorkerOptions {
  readonly workerId: string;
  readonly retryDelayMs: number;
  readonly contextPeopleLimit?: number;
}

export class ExtractionWorker {
  public constructor(
    private readonly jobs: DrizzleJobRepository,
    private readonly extractions: DrizzleExtractionRepository,
    private readonly memory: DrizzleStoryMemoryRepository,
    private readonly provider: StoryExtractionProvider,
    private readonly options: ExtractionWorkerOptions,
  ) {}

  public async processNext(now = new Date()): Promise<WorkerProcessResult> {
    const job = this.jobs.claimNext(this.options.workerId, now);
    if (job === undefined) return 'idle';

    try {
      const context = this.extractions.loadContext(
        job.familyId,
        job.payload.answerId,
        this.options.contextPeopleLimit ?? 20,
      );
      if (context === undefined) throw new PermanentExtractionError('SOURCE_ANSWER_MISSING');

      const extraction = storyExtractionSchema.parse(await this.provider.extract(context.request));
      const plan = normalizeExtraction({
        jobId: job.id,
        workerId: this.options.workerId,
        familyId: job.familyId,
        request: context.request,
        extraction,
        existingFacts: this.memory.listFacts(job.familyId),
        existingEvents: this.memory.listTimelineEvents(job.familyId),
      });
      this.extractions.publishExtraction(plan);
      return 'succeeded';
    } catch (error: unknown) {
      const failure = classifyFailure(error);
      const updated = this.jobs.recordFailure(
        job.id,
        this.options.workerId,
        failure,
        this.options.retryDelayMs,
        now,
      );
      return updated.status === 'queued' ? 'retrying' : 'failed';
    }
  }
}

export interface ExtractionWorkerLoop {
  stop(): void;
}

export function startExtractionWorkerLoop(
  worker: ExtractionWorker,
  jobs: DrizzleJobRepository,
  options: { readonly pollIntervalMs: number; readonly lockTimeoutMs: number },
): ExtractionWorkerLoop {
  let polling = false;
  jobs.recoverStaleJobs(new Date(Date.now() - options.lockTimeoutMs));

  const poll = async (): Promise<void> => {
    if (polling) return;
    polling = true;
    try {
      await worker.processNext();
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          level: 'error',
          operation: 'extraction_worker.poll',
          errorCategory: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    } finally {
      polling = false;
    }
  };
  const timer = setInterval(() => void poll(), options.pollIntervalMs);
  void poll();

  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}

class PermanentExtractionError extends Error {
  public constructor(public readonly code: string) {
    super('The extraction job cannot be completed.');
    this.name = 'PermanentExtractionError';
  }
}

function classifyFailure(error: unknown) {
  if (error instanceof StoryExtractionProviderError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof PermanentExtractionError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof ZodError || error instanceof ExtractionNormalizationError) {
    return {
      code: 'INVALID_EXTRACTION',
      message: 'The extraction output failed validation.',
      retryable: false,
    };
  }
  return {
    code: 'EXTRACTION_PROCESSING_FAILED',
    message: 'The extraction could not be published.',
    retryable: false,
  };
}
