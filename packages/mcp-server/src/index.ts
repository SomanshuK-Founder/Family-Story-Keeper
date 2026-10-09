import { createDatabase, DrizzleInterviewRepository, runMigrations } from '@story-keeper/database';
import { loadConfig } from '@story-keeper/shared';
import { InterviewService } from '@story-keeper/story-engine';

import { createApplication } from './app.js';
import { startHttpServer } from './server.js';

const config = loadConfig();
const database = createDatabase(config.databasePath);
runMigrations(database);
const repository = new DrizzleInterviewRepository(database);
const interviewService = new InterviewService(repository);
const { app } = createApplication(interviewService);

const httpServer = await startHttpServer(app, config.port);
console.log(JSON.stringify({ level: 'info', operation: 'server.start', port: config.port }));

const shutdown = (): void => {
  httpServer.close(() => {
    database.close();
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
