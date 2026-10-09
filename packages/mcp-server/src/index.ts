import { randomUUID } from 'node:crypto';

import { BedrockStoryExtractionProvider } from '@story-keeper/bedrock';
import {
  createDatabase,
  DrizzleExtractionRepository,
  DrizzleInterviewRepository,
  DrizzleJobRepository,
  DrizzleNarratorMemoryRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
} from '@story-keeper/database';
import { loadConfig } from '@story-keeper/shared';
import {
  ExtractionWorker,
  InterviewService,
  NarratorMemoryService,
  startExtractionWorkerLoop,
  type ExtractionWorkerLoop,
} from '@story-keeper/story-engine';

import { createApplication } from './app.js';
import { startHttpServer } from './server.js';

const config = loadConfig();
const database = createDatabase(config.databasePath);
runMigrations(database);
const repository = new DrizzleInterviewRepository(database, config.worker.jobMaxAttempts);
const narratorMemoryService = new NarratorMemoryService(
  repository,
  new DrizzleNarratorMemoryRepository(database),
);
const interviewService = new InterviewService(repository, narratorMemoryService);
const { app } = createApplication(interviewService, narratorMemoryService);

let workerLoop: ExtractionWorkerLoop | undefined;
if (config.extraction.provider === 'bedrock') {
  const jobs = new DrizzleJobRepository(database);
  const worker = new ExtractionWorker(
    jobs,
    new DrizzleExtractionRepository(database),
    new DrizzleStoryMemoryRepository(database),
    new BedrockStoryExtractionProvider(config.extraction),
    {
      workerId: `story-keeper-${randomUUID()}`,
      retryDelayMs: config.worker.retryDelayMs,
    },
  );
  workerLoop = startExtractionWorkerLoop(worker, jobs, {
    pollIntervalMs: config.worker.pollIntervalMs,
    lockTimeoutMs: config.worker.lockTimeoutMs,
  });
}

const httpServer = await startHttpServer(app, config.port);
console.log(JSON.stringify({ level: 'info', operation: 'server.start', port: config.port }));

const shutdown = (): void => {
  workerLoop?.stop();
  httpServer.close(() => {
    database.close();
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
