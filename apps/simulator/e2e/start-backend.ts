import { rmSync } from 'node:fs';

import {
  createDatabase,
  runMigrations,
  seedDemoData,
} from '../../../packages/database/src/index.js';

const databasePath = process.env.DATABASE_PATH;
if (databasePath === undefined) throw new Error('DATABASE_PATH is required for browser tests.');

for (const suffix of ['', '-shm', '-wal']) rmSync(`${databasePath}${suffix}`, { force: true });

const database = createDatabase(databasePath);
runMigrations(database);
seedDemoData(database);
database.close();

await import('../../../packages/mcp-server/src/index.js');
