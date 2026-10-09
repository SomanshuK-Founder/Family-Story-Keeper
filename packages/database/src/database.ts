import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema.js';

export interface StoryKeeperDatabase {
  readonly client: BetterSqlite3.Database;
  readonly db: BetterSQLite3Database<typeof schema>;
  readonly close: () => void;
}

export function createDatabase(databasePath: string): StoryKeeperDatabase {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const client = new BetterSqlite3(databasePath);
  client.pragma('foreign_keys = ON');
  client.pragma('busy_timeout = 5000');
  if (databasePath !== ':memory:') {
    client.pragma('journal_mode = WAL');
    client.pragma('synchronous = NORMAL');
  }

  return {
    client,
    db: drizzle(client, { schema }),
    close: (): void => {
      client.close();
    },
  };
}
