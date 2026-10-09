import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { StoryKeeperDatabase } from './database.js';

export const defaultMigrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export function runMigrations(
  database: StoryKeeperDatabase,
  migrationsFolder = defaultMigrationsFolder,
): void {
  const foreignKeysEnabled = database.client.pragma('foreign_keys', { simple: true }) === 1;
  if (foreignKeysEnabled) database.client.pragma('foreign_keys = OFF');
  try {
    migrate(database.db, { migrationsFolder });
  } finally {
    if (foreignKeysEnabled) database.client.pragma('foreign_keys = ON');
  }
  const foreignKeyViolations: unknown = database.client.pragma('foreign_key_check');
  if (!Array.isArray(foreignKeyViolations) || foreignKeyViolations.length > 0) {
    throw new Error('A database migration left invalid foreign-key references.');
  }
}
