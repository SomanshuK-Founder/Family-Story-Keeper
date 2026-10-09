import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase } from '../src/database.js';
import { defaultMigrationsFolder, runMigrations } from '../src/migrations.js';
import { demoSeedIds, seedDemoData } from '../src/seed.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('database foundation', () => {
  it('opens an in-memory SQLite connection with foreign keys enabled', () => {
    const database = createDatabase(':memory:');

    try {
      const result = database.client.pragma('foreign_keys', { simple: true });
      expect(result).toBe(1);
    } finally {
      database.close();
    }
  });

  it('runs migrations against a clean database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-'));
    temporaryDirectories.push(directory);
    const database = createDatabase(join(directory, 'clean.sqlite'));

    try {
      runMigrations(database);
      const tables = database.client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);

      expect(tables).toEqual([
        '__drizzle_migrations',
        'answers',
        'approvals',
        'chapter_drafts',
        'chapter_sources',
        'consent_events',
        'contradictions',
        'fact_sources',
        'facts',
        'families',
        'family_memberships',
        'interview_sessions',
        'jobs',
        'people',
        'person_candidates',
        'questions',
        'queued_questions',
        'relationship_sources',
        'relationships',
        'timeline_event_sources',
        'timeline_events',
      ]);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 8 });
    } finally {
      database.close();
    }
  });

  it('migrates an existing Phase 2 database forward to the latest schema', () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-upgrade-'));
    temporaryDirectories.push(directory);
    const phaseTwoMigrations = join(directory, 'phase-two-migrations');
    mkdirSync(join(phaseTwoMigrations, 'meta'), { recursive: true });
    copyFileSync(
      join(defaultMigrationsFolder, '0000_phase_zero.sql'),
      join(phaseTwoMigrations, '0000_phase_zero.sql'),
    );
    copyFileSync(
      join(defaultMigrationsFolder, '0001_phase_one_interviews.sql'),
      join(phaseTwoMigrations, '0001_phase_one_interviews.sql'),
    );
    copyFileSync(
      join(defaultMigrationsFolder, '0002_phase_two_story_memory.sql'),
      join(phaseTwoMigrations, '0002_phase_two_story_memory.sql'),
    );
    const journal = JSON.parse(
      readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as MigrationJournal;
    writeFileSync(
      join(phaseTwoMigrations, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 3) }),
    );

    const database = createDatabase(join(directory, 'upgrade.sqlite'));
    try {
      runMigrations(database, phaseTwoMigrations);
      expect(tableExists(database, 'facts')).toBe(true);
      expect(tableExists(database, 'jobs')).toBe(false);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 3 });

      runMigrations(database);

      expect(tableExists(database, 'jobs')).toBe(true);
      expect(tableExists(database, 'person_candidates')).toBe(true);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 8 });
    } finally {
      database.close();
    }
  });

  it('migrates a populated Phase 3 database forward through Phase 6', () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-phase-four-upgrade-'));
    temporaryDirectories.push(directory);
    const phaseThreeMigrations = join(directory, 'phase-three-migrations');
    mkdirSync(join(phaseThreeMigrations, 'meta'), { recursive: true });
    for (const migration of [
      '0000_phase_zero.sql',
      '0001_phase_one_interviews.sql',
      '0002_phase_two_story_memory.sql',
      '0003_phase_three_extraction_jobs.sql',
    ]) {
      copyFileSync(join(defaultMigrationsFolder, migration), join(phaseThreeMigrations, migration));
    }
    const journal = JSON.parse(
      readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as MigrationJournal;
    writeFileSync(
      join(phaseThreeMigrations, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 4) }),
    );

    const database = createDatabase(join(directory, 'phase-three.sqlite'));
    try {
      runMigrations(database, phaseThreeMigrations);
      seedDemoData(database);
      const now = Date.now();
      const interviewId = '10000000-0000-4000-8000-000000000001';
      const questionId = '10000000-0000-4000-8000-000000000002';
      const answerId = '10000000-0000-4000-8000-000000000003';
      database.client
        .prepare(
          `INSERT INTO interview_sessions
             (id, family_id, narrator_person_id, status, started_at, last_active_at, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
        )
        .run(interviewId, demoSeedIds.familyId, demoSeedIds.rosaPersonId, now, now, now, now);
      database.client
        .prepare(
          `INSERT INTO questions
             (id, family_id, interview_session_id, type, text, source, source_reference_id, status, asked_at, created_at)
           VALUES (?, ?, ?, 'phase_one_prompt', 'Question?', 'planner', 'legacy', 'answered', ?, ?)`,
        )
        .run(questionId, demoSeedIds.familyId, interviewId, now, now);
      database.client
        .prepare(
          `INSERT INTO answers
             (id, family_id, interview_session_id, question_id, narrator_person_id, raw_text, created_at)
           VALUES (?, ?, ?, ?, ?, 'Preserved answer.', ?)`,
        )
        .run(
          answerId,
          demoSeedIds.familyId,
          interviewId,
          questionId,
          demoSeedIds.rosaPersonId,
          now,
        );

      runMigrations(database);

      expect(
        database.client.prepare('SELECT raw_text FROM answers WHERE id = ?').get(answerId),
      ).toEqual({ raw_text: 'Preserved answer.' });
      expect(database.client.pragma('foreign_key_check')).toEqual([]);
      expect(
        database.client
          .prepare("SELECT name FROM pragma_table_info('contradictions') WHERE name = ?")
          .get('resolved_by_person_id'),
      ).toEqual({ name: 'resolved_by_person_id' });
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 8 });
    } finally {
      database.close();
    }
  });

  it('migrates an existing Phase 4 database forward through Phase 6', () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-phase-five-upgrade-'));
    temporaryDirectories.push(directory);
    const phaseFourMigrations = join(directory, 'phase-four-migrations');
    mkdirSync(join(phaseFourMigrations, 'meta'), { recursive: true });
    for (const migration of [
      '0000_phase_zero.sql',
      '0001_phase_one_interviews.sql',
      '0002_phase_two_story_memory.sql',
      '0003_phase_three_extraction_jobs.sql',
      '0004_phase_four_conflict_resolution.sql',
    ]) {
      copyFileSync(join(defaultMigrationsFolder, migration), join(phaseFourMigrations, migration));
    }
    const journal = JSON.parse(
      readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as MigrationJournal;
    writeFileSync(
      join(phaseFourMigrations, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 5) }),
    );

    const database = createDatabase(join(directory, 'phase-four.sqlite'));
    try {
      runMigrations(database, phaseFourMigrations);
      seedDemoData(database);
      expect(tableExists(database, 'approvals')).toBe(false);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 5 });

      runMigrations(database);

      expect(tableExists(database, 'approvals')).toBe(true);
      expect(tableExists(database, 'consent_events')).toBe(true);
      expect(
        database.client
          .prepare('SELECT canonical_display_name FROM people WHERE id = ?')
          .get(demoSeedIds.rosaPersonId),
      ).toEqual({ canonical_display_name: 'Rosa' });
      expect(database.client.pragma('foreign_key_check')).toEqual([]);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 8 });
    } finally {
      database.close();
    }
  });

  it('migrates a populated Phase 5 database forward to Phase 6', () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-phase-six-upgrade-'));
    temporaryDirectories.push(directory);
    const phaseFiveMigrations = join(directory, 'phase-five-migrations');
    mkdirSync(join(phaseFiveMigrations, 'meta'), { recursive: true });
    for (const migration of [
      '0000_phase_zero.sql',
      '0001_phase_one_interviews.sql',
      '0002_phase_two_story_memory.sql',
      '0003_phase_three_extraction_jobs.sql',
      '0004_phase_four_conflict_resolution.sql',
      '0005_phase_five_approval_privacy.sql',
    ]) {
      copyFileSync(join(defaultMigrationsFolder, migration), join(phaseFiveMigrations, migration));
    }
    const journal = JSON.parse(
      readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as MigrationJournal;
    writeFileSync(
      join(phaseFiveMigrations, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 6) }),
    );

    const database = createDatabase(join(directory, 'phase-five.sqlite'));
    try {
      runMigrations(database, phaseFiveMigrations);
      seedDemoData(database);
      const now = Date.now();
      const approvalId = '50000000-0000-4000-8000-000000000001';
      database.client
        .prepare(
          `INSERT INTO approvals
             (id, family_id, actor_person_id, target_type, target_id, action, created_at)
           VALUES (?, ?, ?, 'fact', ?, 'approve', ?)`,
        )
        .run(
          approvalId,
          demoSeedIds.familyId,
          demoSeedIds.rosaPersonId,
          '50000000-0000-4000-8000-000000000002',
          now,
        );

      runMigrations(database);

      expect(tableExists(database, 'queued_questions')).toBe(true);
      expect(
        database.client.prepare('SELECT action FROM approvals WHERE id = ?').get(approvalId),
      ).toEqual({ action: 'approve' });
      expect(database.client.pragma('foreign_key_check')).toEqual([]);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 8 });
    } finally {
      database.close();
    }
  });

  it('migrates a populated Phase 6 database forward to Phase 7', () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-phase-seven-upgrade-'));
    temporaryDirectories.push(directory);
    const phaseSixMigrations = join(directory, 'phase-six-migrations');
    mkdirSync(join(phaseSixMigrations, 'meta'), { recursive: true });
    for (const migration of [
      '0000_phase_zero.sql',
      '0001_phase_one_interviews.sql',
      '0002_phase_two_story_memory.sql',
      '0003_phase_three_extraction_jobs.sql',
      '0004_phase_four_conflict_resolution.sql',
      '0005_phase_five_approval_privacy.sql',
      '0006_phase_six_family_questions.sql',
    ]) {
      copyFileSync(join(defaultMigrationsFolder, migration), join(phaseSixMigrations, migration));
    }
    const journal = JSON.parse(
      readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as MigrationJournal;
    writeFileSync(
      join(phaseSixMigrations, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 7) }),
    );

    const database = createDatabase(join(directory, 'phase-six.sqlite'));
    try {
      runMigrations(database, phaseSixMigrations);
      seedDemoData(database);
      const now = Date.now();
      const queuedQuestionId = '60000000-0000-4000-8000-000000000001';
      const senderId = '60000000-0000-4000-8000-000000000002';
      const interviewId = '60000000-0000-4000-8000-000000000003';
      const questionId = '60000000-0000-4000-8000-000000000004';
      const answerId = '60000000-0000-4000-8000-000000000005';
      const jobId = '60000000-0000-4000-8000-000000000006';
      const relationshipId = '60000000-0000-4000-8000-000000000007';
      database.client
        .prepare(
          `INSERT INTO people
             (id, family_id, canonical_display_name, status, created_at, updated_at)
           VALUES (?, ?, 'Maya', 'active', ?, ?)`,
        )
        .run(senderId, demoSeedIds.familyId, now, now);
      database.client
        .prepare(
          `INSERT INTO interview_sessions
             (id, family_id, narrator_person_id, status, started_at, last_active_at, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
        )
        .run(interviewId, demoSeedIds.familyId, demoSeedIds.rosaPersonId, now, now, now, now);
      database.client
        .prepare(
          `INSERT INTO questions
             (id, family_id, interview_session_id, type, text, source, source_reference_id, status, asked_at, created_at)
           VALUES (?, ?, ?, 'phase_one_prompt', 'Preserved?', 'planner', 'preserved', 'answered', ?, ?)`,
        )
        .run(questionId, demoSeedIds.familyId, interviewId, now, now);
      database.client
        .prepare(
          `INSERT INTO answers
             (id, family_id, interview_session_id, question_id, narrator_person_id, raw_text, created_at)
           VALUES (?, ?, ?, ?, ?, 'Preserved Phase 6 answer.', ?)`,
        )
        .run(
          answerId,
          demoSeedIds.familyId,
          interviewId,
          questionId,
          demoSeedIds.rosaPersonId,
          now,
        );
      database.client
        .prepare(
          `INSERT INTO jobs
             (id, family_id, type, payload, deduplication_key, status, attempt_count, max_attempts, available_at, created_at, updated_at)
           VALUES (?, ?, 'extract_answer', ?, ?, 'queued', 0, 3, ?, ?, ?)`,
        )
        .run(
          jobId,
          demoSeedIds.familyId,
          JSON.stringify({ answerId }),
          `extract_answer:${answerId}`,
          now,
          now,
          now,
        );
      database.client
        .prepare(
          `INSERT INTO relationships
             (id, family_id, from_person_id, to_person_id, relationship_type, confidence, approval_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'friend', 0.9, 'pending', ?, ?)`,
        )
        .run(relationshipId, demoSeedIds.familyId, demoSeedIds.rosaPersonId, senderId, now, now);
      database.client
        .prepare(
          `INSERT INTO relationship_sources
             (id, family_id, relationship_id, answer_id, job_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          '60000000-0000-4000-8000-000000000008',
          demoSeedIds.familyId,
          relationshipId,
          answerId,
          jobId,
          now,
        );
      database.client
        .prepare(
          `INSERT INTO queued_questions
             (id, family_id, from_person_id, to_person_id, question_text, status, priority, created_at)
           VALUES (?, ?, ?, ?, 'A preserved family question?', 'queued', 0, ?)`,
        )
        .run(queuedQuestionId, demoSeedIds.familyId, senderId, demoSeedIds.rosaPersonId, now);

      runMigrations(database);

      expect(tableExists(database, 'chapter_drafts')).toBe(true);
      expect(tableExists(database, 'chapter_sources')).toBe(true);
      expect(
        database.client
          .prepare('SELECT question_text FROM queued_questions WHERE id = ?')
          .get(queuedQuestionId),
      ).toEqual({ question_text: 'A preserved family question?' });
      expect(database.client.prepare('SELECT type FROM jobs WHERE id = ?').get(jobId)).toEqual({
        type: 'extract_answer',
      });
      expect(
        database.client
          .prepare(
            'SELECT relationship_id, answer_id, job_id FROM relationship_sources WHERE relationship_id = ?',
          )
          .get(relationshipId),
      ).toEqual({ relationship_id: relationshipId, answer_id: answerId, job_id: jobId });
      expect(database.client.pragma('foreign_key_check')).toEqual([]);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 8 });
    } finally {
      database.close();
    }
  });

  it('seeds the fictional demo family idempotently', () => {
    const database = createDatabase(':memory:');

    try {
      runMigrations(database);
      expect(seedDemoData(database)).toEqual(demoSeedIds);
      expect(seedDemoData(database)).toEqual(demoSeedIds);

      expect(database.client.prepare('SELECT id, display_name FROM families').all()).toEqual([
        { id: demoSeedIds.familyId, display_name: 'Story Keeper Demo Family' },
      ]);
      expect(
        database.client.prepare('SELECT id, canonical_display_name FROM people').all(),
      ).toEqual([{ id: demoSeedIds.rosaPersonId, canonical_display_name: 'Rosa' }]);
    } finally {
      database.close();
    }
  });
});

interface MigrationJournal {
  readonly version: string;
  readonly dialect: string;
  readonly entries: readonly unknown[];
}

function tableExists(database: ReturnType<typeof createDatabase>, tableName: string): boolean {
  return (
    database.client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  );
}
