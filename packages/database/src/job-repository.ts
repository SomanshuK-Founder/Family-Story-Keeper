import { and, asc, eq } from 'drizzle-orm';
import { extractAnswerJobPayloadSchema, type ExtractAnswerJobPayload } from '@story-keeper/shared';

import type { StoryKeeperDatabase } from './database.js';
import { jobs } from './schema.js';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ExtractionJobRecord {
  readonly id: string;
  readonly familyId: string;
  readonly type: 'extract_answer';
  readonly payload: ExtractAnswerJobPayload;
  readonly status: JobStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly availableAt: Date;
  readonly lockedAt: Date | null;
  readonly lockedBy: string | null;
  readonly completedAt: Date | null;
  readonly lastErrorCode: string | null;
}

export interface JobFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export class JobRepositoryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'JobRepositoryError';
  }
}

export class DrizzleJobRepository {
  public constructor(private readonly database: StoryKeeperDatabase) {}

  public findById(jobId: string): ExtractionJobRecord | undefined {
    const row = this.database.db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1).get();
    return row === undefined ? undefined : toJobRecord(row);
  }

  public listByFamily(familyId: string): readonly ExtractionJobRecord[] {
    return this.database.db
      .select()
      .from(jobs)
      .where(eq(jobs.familyId, familyId))
      .orderBy(asc(jobs.createdAt), asc(jobs.id))
      .all()
      .map(toJobRecord);
  }

  public claimNext(workerId: string, now = new Date()): ExtractionJobRecord | undefined {
    const timestamp = now.getTime();
    const row = this.database.client
      .prepare(
        `UPDATE jobs
         SET status = 'running',
             attempt_count = attempt_count + 1,
             locked_at = ?,
             locked_by = ?,
             updated_at = ?,
             last_error_code = NULL,
             last_error_message = NULL
         WHERE id = (
           SELECT id FROM jobs
           WHERE status = 'queued'
             AND available_at <= ?
             AND attempt_count < max_attempts
           ORDER BY available_at, created_at, id
           LIMIT 1
         )
           AND status = 'queued'
         RETURNING *`,
      )
      .get(timestamp, workerId, timestamp, timestamp) as RawJobRow | undefined;

    return row === undefined ? undefined : toRawJobRecord(row);
  }

  public recordFailure(
    jobId: string,
    workerId: string,
    failure: JobFailure,
    retryDelayMs: number,
    now = new Date(),
  ): ExtractionJobRecord {
    const current = this.findById(jobId);
    if (current === undefined || current.status !== 'running' || current.lockedBy !== workerId) {
      throw new JobRepositoryError('The extraction job is not held by this worker.');
    }

    const retry = failure.retryable && current.attemptCount < current.maxAttempts;
    const updated = this.database.db
      .update(jobs)
      .set({
        status: retry ? 'queued' : 'failed',
        availableAt: retry ? new Date(now.getTime() + retryDelayMs) : current.availableAt,
        lockedAt: null,
        lockedBy: null,
        completedAt: retry ? null : now,
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running'), eq(jobs.lockedBy, workerId)))
      .run();
    if (updated.changes !== 1) {
      throw new JobRepositoryError('The extraction job lock changed before failure was recorded.');
    }

    const result = this.findById(jobId);
    if (result === undefined) throw new JobRepositoryError('The extraction job disappeared.');
    return result;
  }

  public recoverStaleJobs(staleBefore: Date, now = new Date()): number {
    const result = this.database.client
      .prepare(
        `UPDATE jobs
         SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'queued' END,
             available_at = CASE WHEN attempt_count >= max_attempts THEN available_at ELSE ? END,
             completed_at = CASE WHEN attempt_count >= max_attempts THEN ? ELSE NULL END,
             locked_at = NULL,
             locked_by = NULL,
             last_error_code = 'WORKER_LOCK_EXPIRED',
             last_error_message = 'The previous worker lock expired.',
             updated_at = ?
         WHERE status = 'running' AND locked_at <= ?`,
      )
      .run(now.getTime(), now.getTime(), now.getTime(), staleBefore.getTime());
    return result.changes;
  }
}

interface RawJobRow {
  readonly id: string;
  readonly family_id: string;
  readonly type: 'extract_answer';
  readonly payload: string;
  readonly status: JobStatus;
  readonly attempt_count: number;
  readonly max_attempts: number;
  readonly available_at: number;
  readonly locked_at: number | null;
  readonly locked_by: string | null;
  readonly completed_at: number | null;
  readonly last_error_code: string | null;
}

function toJobRecord(row: typeof jobs.$inferSelect): ExtractionJobRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    type: row.type,
    payload: parsePayload(row.payload),
    status: row.status,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    availableAt: row.availableAt,
    lockedAt: row.lockedAt,
    lockedBy: row.lockedBy,
    completedAt: row.completedAt,
    lastErrorCode: row.lastErrorCode,
  };
}

function toRawJobRecord(row: RawJobRow): ExtractionJobRecord {
  return {
    id: row.id,
    familyId: row.family_id,
    type: row.type,
    payload: parsePayload(row.payload),
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    availableAt: new Date(row.available_at),
    lockedAt: row.locked_at === null ? null : new Date(row.locked_at),
    lockedBy: row.locked_by,
    completedAt: row.completed_at === null ? null : new Date(row.completed_at),
    lastErrorCode: row.last_error_code,
  };
}

function parsePayload(payload: string): ExtractAnswerJobPayload {
  return extractAnswerJobPayloadSchema.parse(JSON.parse(payload));
}
