import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Router } from 'express';

export function createStoryKeeperMcpServer(): McpServer {
  return new McpServer({
    name: 'family-story-keeper',
    version: '0.0.0',
  });
}

export function createMcpRouter(): Router {
  const router = Router();

  router.all('/', (_request, response) => {
    response.status(501).json({
      error: {
        code: 'MCP_TRANSPORT_NOT_ENABLED',
        message: 'The Streamable HTTP transport is introduced in Phase 1.',
      },
    });
  });

  return router;
}
