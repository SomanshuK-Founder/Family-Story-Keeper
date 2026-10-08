import express, { type Express } from 'express';

import { createMcpRouter, createStoryKeeperMcpServer } from './mcp.js';

export interface StoryKeeperApplication {
  readonly app: Express;
  readonly mcpServer: ReturnType<typeof createStoryKeeperMcpServer>;
}

export function createApplication(): StoryKeeperApplication {
  const app = express();
  const mcpServer = createStoryKeeperMcpServer();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.use('/mcp', createMcpRouter());

  return { app, mcpServer };
}
