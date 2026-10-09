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
        'contradictions',
        'fact_sources',
        'facts',
        'families',
        'family_memberships',
        'interview_sessions',
        'people',
        'questions',
        'relationships',
        'timeline_events',
      ]);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 3 });
    } finally {
      database.close();
    }
  });

  it('migrates an existing Phase 1 database forward to Phase 2', () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-upgrade-'));
    temporaryDirectories.push(directory);
    const phaseOneMigrations = join(directory, 'phase-one-migrations');
    mkdirSync(join(phaseOneMigrations, 'meta'), { recursive: true });
    copyFileSync(
      join(defaultMigrationsFolder, '0000_phase_zero.sql'),
      join(phaseOneMigrations, '0000_phase_zero.sql'),
    );
    copyFileSync(
      join(defaultMigrationsFolder, '0001_phase_one_interviews.sql'),
      join(phaseOneMigrations, '0001_phase_one_interviews.sql'),
    );
    const journal = JSON.parse(
      readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as MigrationJournal;
    writeFileSync(
      join(phaseOneMigrations, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
    );

    const database = createDatabase(join(directory, 'upgrade.sqlite'));
    try {
      runMigrations(database, phaseOneMigrations);
      expect(tableExists(database, 'facts')).toBe(false);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 2 });

      runMigrations(database);

      expect(tableExists(database, 'facts')).toBe(true);
      expect(tableExists(database, 'contradictions')).toBe(true);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 3 });
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
