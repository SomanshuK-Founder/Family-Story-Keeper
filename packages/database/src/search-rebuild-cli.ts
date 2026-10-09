import { loadConfig } from '@story-keeper/shared';

import { createDatabase } from './database.js';
import { runMigrations } from './migrations.js';
import { SqliteSearchRepository } from './search-repository.js';

const config = loadConfig();
const database = createDatabase(config.databasePath);
try {
  runMigrations(database);
  const indexedDocuments = new SqliteSearchRepository(database).rebuild();
  console.log(JSON.stringify({ operation: 'search.rebuild', indexedDocuments }));
} finally {
  database.close();
}
