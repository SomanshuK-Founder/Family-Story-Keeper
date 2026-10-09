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
  DrizzlePresentationRepository,
  DrizzleStoryMemoryRepository,
  SqliteSearchRepository,
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
  PresentationService,
  PrivacyService,
  SearchService,
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
const presentationService = new PresentationService(
  new DrizzlePrivacyRepository(database),
  new DrizzlePresentationRepository(database),
);
const searchService = new SearchService(
  new DrizzlePrivacyRepository(database),
  new SqliteSearchRepository(database),
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
  presentationService,
  searchService,
  config.http,
);

let workerLoop: ExtractionWorkerLoop | undefined;
let chapterWorkerLoop: ChapterWorkerLoop | undefined;
const jobs = new DrizzleJobRepository(database);
let extractionWorker: ExtractionWorker | undefined;
let chapterWorker: ChapterWorker | undefined;
if (config.extraction.provider === 'bedrock') {
  extractionWorker = new ExtractionWorker(
    jobs,
    new DrizzleExtractionRepository(database),
    new DrizzleStoryMemoryRepository(database),
    new BedrockStoryExtractionProvider(config.extraction),
    {
      workerId: `story-keeper-${randomUUID()}`,
      retryDelayMs: config.worker.retryDelayMs,
    },
  );
}
if (config.chapter.provider === 'bedrock') {
  chapterWorker = new ChapterWorker(
    jobs,
    chapterRepository,
    new BedrockChapterGenerationProvider(config.chapter),
    {
      workerId: `story-keeper-chapter-${randomUUID()}`,
      retryDelayMs: config.worker.retryDelayMs,
    },
  );
}

const httpServer = await startHttpServer(app, config.port, config.http.host);
if (extractionWorker !== undefined) {
  workerLoop = startExtractionWorkerLoop(extractionWorker, jobs, {
    pollIntervalMs: config.worker.pollIntervalMs,
    lockTimeoutMs: config.worker.lockTimeoutMs,
  });
}
if (chapterWorker !== undefined) {
  chapterWorkerLoop = startChapterWorkerLoop(chapterWorker, jobs, {
    pollIntervalMs: config.worker.pollIntervalMs,
    lockTimeoutMs: config.worker.lockTimeoutMs,
  });
}

console.log(
  JSON.stringify({
    level: 'info',
    operation: 'server.start',
    host: config.http.host,
    port: config.port,
  }),
);

let shutdownPromise: Promise<void> | undefined;
const shutdown = (signal: NodeJS.Signals): Promise<void> => {
  shutdownPromise ??= (async () => {
    console.log(JSON.stringify({ level: 'info', operation: 'server.stop', signal }));
    await Promise.all([
      closeHttpServer(),
      workerLoop?.stop() ?? Promise.resolve(),
      chapterWorkerLoop?.stop() ?? Promise.resolve(),
    ]);
    database.close();
  })();
  return shutdownPromise;
};

const closeHttpServer = (): Promise<void> =>
  new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
