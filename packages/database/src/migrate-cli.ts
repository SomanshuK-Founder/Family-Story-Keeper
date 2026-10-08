import { loadConfig } from '@story-keeper/shared';

import { createDatabase } from './database.js';
import { runMigrations } from './migrations.js';

const config = loadConfig();
const database = createDatabase(config.databasePath);

try {
  runMigrations(database);
} finally {
  database.close();
}
