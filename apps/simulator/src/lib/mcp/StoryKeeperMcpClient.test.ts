import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';

import {
  STORY_KEEPER_TOOL_NAMES,
  StoryKeeperClientError,
  StoryKeeperMcpClient,
  resolveMcpEndpoint,
} from './StoryKeeperMcpClient.js';

const endpoint = new URL('http://localhost:4173/mcp');
const familyId = '00000000-0000-4000-8000-000000000001';
const personId = '00000000-0000-4000-8000-000000000002';
const interviewId = '10000000-0000-4000-8000-000000000001';
const questionId = '10000000-0000-4000-8000-000000000002';
const answerId = '10000000-0000-4000-8000-000000000003';

function result(structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function createSession(overrides: Partial<ReturnType<typeof baseSession>> = {}) {
  return { ...baseSession(), ...overrides };
}

function baseSession() {
  return {
    initialize: vi.fn(() => Promise.resolve()),
    listTools: vi.fn(() => Promise.resolve([...STORY_KEEPER_TOOL_NAMES])),
    callTool: vi.fn((name: string) => {
      if (name === 'start_interview') {
        return Promise.resolve(
          result({
            interviewId,
            narrator: { id: personId, displayName: 'Rosa' },
            questionId,
            questionText: 'What do you remember?',
          }),
        );
      }
      if (name === 'get_next_question') {
        return Promise.resolve(
          result({
            status: 'question',
            interviewId,
            questionId,
            questionText: 'What do you remember?',
          }),
        );
      }
      return Promise.resolve(result({ answerId, status: 'saved' }));
    }),
    close: vi.fn(() => Promise.resolve()),
  };
}

describe('StoryKeeperMcpClient', () => {
  it('initializes, verifies all 15 tools, validates calls, and closes cleanly', async () => {
    const session = createSession();
    const client = new StoryKeeperMcpClient(endpoint, () => session);

    await expect(client.connect()).resolves.toEqual(STORY_KEEPER_TOOL_NAMES);
    expect(session.initialize).toHaveBeenCalledTimes(1);
    await expect(client.startInterview({ familyId, personId })).resolves.toMatchObject({
      interviewId,
      narrator: { displayName: 'Rosa' },
    });
    await expect(client.getNextQuestion({ familyId, interviewId })).resolves.toMatchObject({
      status: 'question',
      questionId,
    });
    await expect(
      client.saveAnswer({ familyId, interviewId, questionId, rawText: 'A real memory.' }),
    ).resolves.toEqual({ answerId, status: 'saved' });
    await client.disconnect();
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('fails visibly and closes when tools/list differs from the frozen contract', async () => {
    const session = createSession({ listTools: vi.fn(() => Promise.resolve(['start_interview'])) });
    const client = new StoryKeeperMcpClient(endpoint, () => session);

    await expect(client.connect()).rejects.toMatchObject({ code: 'tool_contract' });
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('turns connection failures into a controlled unavailable error', async () => {
    const session = createSession({
      initialize: vi.fn(() => Promise.reject(new Error('fetch failed at private path'))),
    });
    const client = new StoryKeeperMcpClient(endpoint, () => session);

    await expect(client.connect()).rejects.toEqual(
      new StoryKeeperClientError(
        'unavailable',
        'Story Keeper could not connect to the MCP server.',
      ),
    );
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed inputs and malformed responses at the client boundary', async () => {
    const session = createSession({
      callTool: vi.fn(() => Promise.resolve(result({ unexpected: true }))),
    });
    const client = new StoryKeeperMcpClient(endpoint, () => session);
    await client.connect();

    await expect(client.startInterview({ familyId: 'bad-id', personId })).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(client.startInterview({ familyId, personId })).rejects.toMatchObject({
      code: 'protocol',
    });
  });

  it('resolves a relative or absolute configured endpoint in one place', () => {
    expect(resolveMcpEndpoint(undefined, 'http://localhost:4173/').href).toBe(
      'http://localhost:4173/mcp',
    );
    expect(
      resolveMcpEndpoint('https://example.test/story/mcp', 'http://localhost:4173/').href,
    ).toBe('https://example.test/story/mcp');
  });
});
