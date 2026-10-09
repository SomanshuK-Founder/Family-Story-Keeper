import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { Express } from 'express';

import type {
  InterviewService,
  ChapterService,
  FamilyQuestionService,
  NarratorMemoryService,
  PresentationService,
  PrivacyService,
  SearchService,
} from '@story-keeper/story-engine';

import { createMcpRouter } from './mcp.js';

export interface StoryKeeperApplication {
  readonly app: Express;
}

export function createApplication(
  interviewService: InterviewService,
  narratorMemoryService: NarratorMemoryService,
  privacyService: PrivacyService,
  familyQuestionService: FamilyQuestionService,
  chapterService: ChapterService,
  presentationService: PresentationService,
  searchService: SearchService,
): StoryKeeperApplication {
  const app = createMcpExpressApp();

  app.disable('x-powered-by');

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.use(
    '/mcp',
    createMcpRouter(
      interviewService,
      narratorMemoryService,
      privacyService,
      familyQuestionService,
      chapterService,
      presentationService,
      searchService,
    ),
  );

  return { app };
}
