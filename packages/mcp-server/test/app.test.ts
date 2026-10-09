import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { startTestRuntime, type TestRuntime } from './runtime.js';

describe('HTTP application', () => {
  let runtime: TestRuntime | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
  });

  it('returns a successful health response', async () => {
    runtime = await startTestRuntime(':memory:');

    await request(runtime.httpServer).get('/health').expect(200, { status: 'ok' });
  });

  it('serves MCP over POST and rejects standalone GET', async () => {
    runtime = await startTestRuntime(':memory:');

    await request(runtime.httpServer)
      .get('/mcp')
      .expect('Allow', 'POST')
      .expect(405)
      .expect((response) => {
        expect(response.text).toContain('Method not allowed.');
      });
  });

  it('rejects malformed and oversized JSON with controlled errors', async () => {
    runtime = await startTestRuntime(':memory:');

    await request(runtime.httpServer)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          error: { code: -32_700, message: 'Invalid JSON request body.' },
        });
        expect(response.text).not.toMatch(/SyntaxError|node_modules|[A-Z]:\\/u);
      });

    await request(runtime.httpServer)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ value: 'x'.repeat(110_000) }))
      .expect(413)
      .expect((response) => {
        expect(response.body).toMatchObject({
          error: { code: -32_001, message: 'Request body is too large.' },
        });
      });
  });

  it('uses the SDK host guard and an optional origin allowlist', async () => {
    runtime = await startTestRuntime(':memory:', {
      allowedOrigins: ['https://allowed.example'],
    });

    await request(runtime.httpServer).get('/health').set('Host', 'evil.example').expect(403);
    await request(runtime.httpServer)
      .get('/health')
      .set('Origin', 'https://blocked.example')
      .expect(403);
    await request(runtime.httpServer)
      .get('/health')
      .set('Origin', 'https://allowed.example')
      .expect(200, { status: 'ok' });
    await request(runtime.httpServer).get('/health').expect(200, { status: 'ok' });
  });
});
