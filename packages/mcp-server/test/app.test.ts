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
});
