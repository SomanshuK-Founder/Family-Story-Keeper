import { randomUUID } from 'node:crypto';

import {
  BedrockChapterGenerationProvider,
  BedrockStoryExtractionProvider,
} from '@story-keeper/bedrock';
import {
  createDatabase,
  DrizzleChapterRepository,
  DrizzleFamilyQuestionRepository,
  DrizzleExtractionRepository,
  DrizzleInterviewRepository,
  DrizzleJobRepository,
  DrizzleNarratorMemoryRepository,
  DrizzlePrivacyRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
} from '@story-keeper/database';
import { loadConfig } from '@story-keeper/shared';
import {
  ChapterService,
  ChapterWorker,
  ExtractionWorker,
  FamilyQuestionService,
  InterviewService,
  NarratorMemoryService,
  PrivacyService,
  startChapterWorkerLoop,
  startExtractionWorkerLoop,
  type ChapterWorkerLoop,
  type ExtractionWorkerLoop,
} from '@story-keeper/story-engine';

import { createApplication } from './app.js';
import { startHttpServer } from './server.js';

const config = loadConfig();
const database = createDatabase(config.databasePath);
runMigrations(database);
const repository = new DrizzleInterviewRepository(database, config.worker.jobMaxAttempts);
const narratorMemoryRepository = new DrizzleNarratorMemoryRepository(database);
const narratorMemoryService = new NarratorMemoryService(repository, narratorMemoryRepository);
const privacyService = new PrivacyService(
  new DrizzlePrivacyRepository(database),
  narratorMemoryRepository,
);
const familyQuestionService = new FamilyQuestionService(
  new DrizzleFamilyQuestionRepository(database),
);
const chapterRepository = new DrizzleChapterRepository(database);
const chapterService = new ChapterService(chapterRepository, config.worker.jobMaxAttempts);
const interviewService = new InterviewService(
  repository,
  narratorMemoryService,
  familyQuestionService,
);
const { app } = createApplication(
  interviewService,
  narratorMemoryService,
  privacyService,
  familyQuestionService,
  chapterService,
);

let workerLoop: ExtractionWorkerLoop | undefined;
let chapterWorkerLoop: ChapterWorkerLoop | undefined;
const jobs = new DrizzleJobRepository(database);
if (config.extraction.provider === 'bedrock') {
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
if (config.chapter.provider === 'bedrock') {
  const worker = new ChapterWorker(
    jobs,
    chapterRepository,
    new BedrockChapterGenerationProvider(config.chapter),
    {
      workerId: `story-keeper-chapter-${randomUUID()}`,
      retryDelayMs: config.worker.retryDelayMs,
    },
  );
  chapterWorkerLoop = startChapterWorkerLoop(worker, jobs, {
    pollIntervalMs: config.worker.pollIntervalMs,
    lockTimeoutMs: config.worker.lockTimeoutMs,
  });
}

const httpServer = await startHttpServer(app, config.port);
console.log(JSON.stringify({ level: 'info', operation: 'server.start', port: config.port }));

const shutdown = (): void => {
  workerLoop?.stop();
  chapterWorkerLoop?.stop();
  httpServer.close(() => {
    database.close();
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
