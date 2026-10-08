import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { StoryKeeperDatabase } from './database.js';

export const defaultMigrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export function runMigrations(
  database: StoryKeeperDatabase,
  migrationsFolder = defaultMigrationsFolder,
): void {
  migrate(database.db, { migrationsFolder });
}
