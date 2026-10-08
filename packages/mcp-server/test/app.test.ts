import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApplication } from '../src/app.js';
import { startHttpServer } from '../src/server.js';

describe('MCP server foundation', () => {
  it('returns a successful health response', async () => {
    const { app } = createApplication();

    await request(app).get('/health').expect(200, { status: 'ok' });
  });

  it('reserves the MCP endpoint without registering product tools', async () => {
    const { app } = createApplication();

    const response = await request(app).post('/mcp').send({});
    expect(response.status).toBe(501);
    expect(response.body).toEqual({
      error: {
        code: 'MCP_TRANSPORT_NOT_ENABLED',
        message: 'The Streamable HTTP transport is introduced in Phase 1.',
      },
    });
  });

  it('boots an HTTP server', async () => {
    const { app } = createApplication();
    const server = await startHttpServer(app, 0);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
});
