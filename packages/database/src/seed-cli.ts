import { loadConfig } from '@story-keeper/shared';

import { createDatabase } from './database.js';
import { runMigrations } from './migrations.js';
import { seedDemoShowcaseData } from './seed.js';

const config = loadConfig();
const database = createDatabase(config.databasePath);

try {
  runMigrations(database);
  const ids = seedDemoShowcaseData(database);
  console.log(JSON.stringify({ status: 'seeded', ...ids }));
} finally {
  database.close();
}
