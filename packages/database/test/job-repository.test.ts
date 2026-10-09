import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase, type StoryKeeperDatabase } from '../src/database.js';
import { DrizzleInterviewRepository } from '../src/interview-repository.js';
import { DrizzleJobRepository } from '../src/job-repository.js';
import { runMigrations } from '../src/migrations.js';
import { demoSeedIds, seedDemoData } from '../src/seed.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('DrizzleJobRepository', () => {
  it('claims one available job atomically and prevents a second claim', () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-claim-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'jobs.sqlite');
    const firstDatabase = createDatabase(path);
    runMigrations(firstDatabase);
    seedDemoData(firstDatabase);
    const answerId = createAnswer(firstDatabase, 3);
    const secondDatabase = createDatabase(path);

    try {
      const firstJobs = new DrizzleJobRepository(firstDatabase);
      const secondJobs = new DrizzleJobRepository(secondDatabase);
      const claimed = firstJobs.claimNext('worker-one');

      expect(claimed).toMatchObject({
        status: 'running',
        attemptCount: 1,
        lockedBy: 'worker-one',
        payload: { answerId },
      });
      expect(secondJobs.claimNext('worker-two')).toBeUndefined();
    } finally {
      secondDatabase.close();
      firstDatabase.close();
    }
  });

  it('requeues retryable failures and fails after the bounded attempt limit', () => {
    const database = createReadyDatabase();
    try {
      createAnswer(database, 2);
      const jobs = new DrizzleJobRepository(database);
      const firstAttemptAt = new Date();
      const first = jobs.claimNext('worker', firstAttemptAt);
      if (first === undefined) throw new Error('Expected the first job claim to succeed.');
      const retried = jobs.recordFailure(
        first.id,
        'worker',
        { code: 'BEDROCK_TRANSIENT', message: 'Transient provider failure.', retryable: true },
        100,
        firstAttemptAt,
      );
      expect(retried).toMatchObject({ status: 'queued', attemptCount: 1 });
      expect(jobs.claimNext('worker', new Date(firstAttemptAt.getTime() + 99))).toBeUndefined();

      const secondAttemptAt = new Date(firstAttemptAt.getTime() + 100);
      const second = jobs.claimNext('worker', secondAttemptAt);
      if (second === undefined) throw new Error('Expected the retry claim to succeed.');
      expect(second.attemptCount).toBe(2);
      const failed = jobs.recordFailure(
        second.id,
        'worker',
        { code: 'BEDROCK_TRANSIENT', message: 'Transient provider failure.', retryable: true },
        100,
        secondAttemptAt,
      );
      expect(failed).toMatchObject({ status: 'failed', attemptCount: 2 });
    } finally {
      database.close();
    }
  });

  it('persists queued work across restart and recovers stale locks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-restart-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'jobs.sqlite');
    const firstDatabase = createDatabase(path);
    runMigrations(firstDatabase);
    seedDemoData(firstDatabase);
    const answerId = createAnswer(firstDatabase, 3);
    firstDatabase.close();

    const restarted = createDatabase(path);
    try {
      const jobs = new DrizzleJobRepository(restarted);
      const queuedJob = jobs.listByFamily(demoSeedIds.familyId)[0];
      expect(queuedJob?.type).toBe('extract_answer');
      if (queuedJob?.type !== 'extract_answer') throw new Error('Expected extraction job.');
      expect(queuedJob.payload.answerId).toBe(answerId);
      const claimedAt = new Date();
      const claimed = jobs.claimNext('dead-worker', claimedAt);
      if (claimed === undefined) throw new Error('Expected the queued job to be claimable.');
      expect(claimed.status).toBe('running');
      expect(
        jobs.recoverStaleJobs(
          new Date(claimedAt.getTime() + 1),
          new Date(claimedAt.getTime() + 1_000),
        ),
      ).toBe(1);
      expect(jobs.findById(claimed.id)).toMatchObject({
        status: 'queued',
        lastErrorCode: 'WORKER_LOCK_EXPIRED',
      });
    } finally {
      restarted.close();
    }
  });
});

function createReadyDatabase(): StoryKeeperDatabase {
  const database = createDatabase(':memory:');
  runMigrations(database);
  seedDemoData(database);
  return database;
}

function createAnswer(database: StoryKeeperDatabase, maxAttempts: number): string {
  const interviews = new DrizzleInterviewRepository(database, maxAttempts);
  const interview = interviews.createInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
  const question = interviews.createQuestion({
    familyId: demoSeedIds.familyId,
    interviewId: interview.id,
    text: 'What happened?',
    sourceReferenceId: 'job-test',
  });
  return interviews.createAnswer({
    familyId: demoSeedIds.familyId,
    interviewId: interview.id,
    questionId: question.id,
    narratorPersonId: demoSeedIds.rosaPersonId,
    rawText: 'A durable source answer.',
  }).id;
}
