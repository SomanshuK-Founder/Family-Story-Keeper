import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  createDatabase,
  DrizzleChapterRepository,
  DrizzleFamilyQuestionRepository,
  DrizzleInterviewRepository,
  DrizzleNarratorMemoryRepository,
  DrizzlePrivacyRepository,
  DrizzlePresentationRepository,
  SqliteSearchRepository,
  runMigrations,
  seedDemoData,
  type StoryKeeperDatabase,
} from '@story-keeper/database';
import {
  InterviewService,
  ChapterService,
  FamilyQuestionService,
  NarratorMemoryService,
  PresentationService,
  PrivacyService,
  SearchService,
} from '@story-keeper/story-engine';

import { createApplication, type HttpApplicationOptions } from '../src/app.js';
import { startHttpServer } from '../src/server.js';

export interface TestRuntime {
  readonly database: StoryKeeperDatabase;
  readonly repository: DrizzleInterviewRepository;
  readonly interviewService: InterviewService;
  readonly narratorMemoryService: NarratorMemoryService;
  readonly privacyService: PrivacyService;
  readonly familyQuestionService: FamilyQuestionService;
  readonly chapterService: ChapterService;
  readonly presentationService: PresentationService;
  readonly searchService: SearchService;
  readonly httpServer: Server;
  readonly mcpUrl: URL;
  close(): Promise<void>;
}

export async function startTestRuntime(
  databasePath: string,
  httpOptions: HttpApplicationOptions = {},
): Promise<TestRuntime> {
  const database = createDatabase(databasePath);
  runMigrations(database);
  seedDemoData(database);
  const repository = new DrizzleInterviewRepository(database);
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
  const chapterService = new ChapterService(new DrizzleChapterRepository(database), 3);
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
    httpOptions,
  );
  const host = httpOptions.host ?? '127.0.0.1';
  const httpServer = await startHttpServer(app, 0, host);
  const address = httpServer.address() as AddressInfo;

  return {
    database,
    repository,
    interviewService,
    narratorMemoryService,
    privacyService,
    familyQuestionService,
    chapterService,
    presentationService,
    searchService,
    httpServer,
    mcpUrl: new URL(`http://127.0.0.1:${String(address.port)}/mcp`),
    close: async (): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      database.close();
    },
  };
}
