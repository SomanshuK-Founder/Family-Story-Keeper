import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { Express, NextFunction, Request, Response } from 'express';

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

export interface HttpApplicationOptions {
  readonly host?: string;
  readonly allowedHosts?: readonly string[];
  readonly allowedOrigins?: readonly string[];
}

export function createApplication(
  interviewService: InterviewService,
  narratorMemoryService: NarratorMemoryService,
  privacyService: PrivacyService,
  familyQuestionService: FamilyQuestionService,
  chapterService: ChapterService,
  presentationService: PresentationService,
  searchService: SearchService,
  options: HttpApplicationOptions = {},
): StoryKeeperApplication {
  const host = options.host ?? '127.0.0.1';
  const app = createMcpExpressApp({
    host,
    ...(options.allowedHosts === undefined ? {} : { allowedHosts: [...options.allowedHosts] }),
  });

  app.disable('x-powered-by');

  if (options.allowedOrigins !== undefined) {
    const allowedOrigins = new Set(options.allowedOrigins);
    app.use((request, response, next) => {
      const origin = request.header('origin');
      if (origin !== undefined && !allowedOrigins.has(origin)) {
        response.status(403).json({
          jsonrpc: '2.0',
          error: { code: -32_000, message: 'Origin is not allowed.' },
          id: null,
        });
        return;
      }
      next();
    });
  }

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

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction): void => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const status = readHttpErrorStatus(error);
    response.status(status).json({
      jsonrpc: '2.0',
      error: {
        code: status === 413 ? -32_001 : status === 400 ? -32_700 : -32_603,
        message:
          status === 413
            ? 'Request body is too large.'
            : status === 400
              ? 'Invalid JSON request body.'
              : 'Internal server error.',
      },
      id: null,
    });
  });

  return { app };
}

function readHttpErrorStatus(error: unknown): 400 | 413 | 500 {
  if (typeof error !== 'object' || error === null) return 500;
  if ('status' in error && error.status === 413) {
    return 413;
  }
  if (
    ('status' in error && error.status === 400) ||
    ('type' in error && error.type === 'entity.parse.failed')
  ) {
    return 400;
  }
  return 500;
}
