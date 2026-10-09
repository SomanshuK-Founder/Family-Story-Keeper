import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  createDatabase,
  DrizzleFamilyQuestionRepository,
  DrizzleInterviewRepository,
  DrizzleNarratorMemoryRepository,
  DrizzlePrivacyRepository,
  runMigrations,
  seedDemoData,
  type StoryKeeperDatabase,
} from '@story-keeper/database';
import {
  InterviewService,
  FamilyQuestionService,
  NarratorMemoryService,
  PrivacyService,
} from '@story-keeper/story-engine';

import { createApplication } from '../src/app.js';
import { startHttpServer } from '../src/server.js';

export interface TestRuntime {
  readonly database: StoryKeeperDatabase;
  readonly repository: DrizzleInterviewRepository;
  readonly narratorMemoryService: NarratorMemoryService;
  readonly privacyService: PrivacyService;
  readonly familyQuestionService: FamilyQuestionService;
  readonly httpServer: Server;
  readonly mcpUrl: URL;
  close(): Promise<void>;
}

export async function startTestRuntime(databasePath: string): Promise<TestRuntime> {
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
  const familyQuestionService = new FamilyQuestionService(
    new DrizzleFamilyQuestionRepository(database),
  );
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
  );
  const httpServer = await startHttpServer(app, 0);
  const address = httpServer.address() as AddressInfo;

  return {
    database,
    repository,
    narratorMemoryService,
    privacyService,
    familyQuestionService,
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
