import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
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
        'families',
        'family_memberships',
        'interview_sessions',
        'people',
        'questions',
      ]);
      expect(
        database.client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get(),
      ).toEqual({ count: 2 });
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
