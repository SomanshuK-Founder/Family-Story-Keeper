import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { storyKeeperDemoIds } from '@story-keeper/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  STORY_KEEPER_TOOL_NAMES,
  StoryKeeperClientError,
  StoryKeeperMcpClient,
  resolveMcpEndpoint,
  type McpSession,
} from '../src/index.js';

const endpoint = new URL('http://localhost:4173/mcp');
const { familyId, rosaPersonId: personId, mayaPersonId } = storyKeeperDemoIds;
const interviewId = '10000000-0000-4000-8000-000000000001';
const questionId = '10000000-0000-4000-8000-000000000002';
const answerId = '10000000-0000-4000-8000-000000000003';

function result(structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: 'Structured response' }], structuredContent };
}

function baseSession() {
  return {
    initialize: vi.fn(() => Promise.resolve()),
    listTools: vi.fn(() => Promise.resolve([...STORY_KEEPER_TOOL_NAMES])),
    callTool: vi.fn((name: string) => {
      if (name === 'start_interview')
        return Promise.resolve(
          result({
            interviewId,
            narrator: { id: personId, displayName: 'Rosa' },
            questionId,
            questionText: 'What do you remember?',
          }),
        );
      if (name === 'get_next_question')
        return Promise.resolve(
          result({
            status: 'question',
            interviewId,
            questionId,
            questionText: 'What do you remember?',
          }),
        );
      if (name === 'save_answer') return Promise.resolve(result({ answerId, status: 'saved' }));
      if (name === 'get_story_context')
        return Promise.resolve(
          result({
            actor: { id: personId, displayName: 'Rosa', role: 'narrator' },
            visibility: 'narrator_review',
            facts: [],
            relationships: [],
            timelineEvents: [],
            chapters: [],
            conflicts: [],
          }),
        );
      if (name === 'list_pending_conflicts') return Promise.resolve(result({ conflicts: [] }));
      return Promise.resolve(result({ items: [] }));
    }),
    close: vi.fn(() => Promise.resolve()),
  } satisfies McpSession;
}

describe('StoryKeeperMcpClient', () => {
  it('initializes, verifies 15 tools, validates Phase 1 and Phase 2 calls, and closes', async () => {
    const session = baseSession();
    const client = new StoryKeeperMcpClient(endpoint, () => session);
    await expect(client.connect()).resolves.toEqual(STORY_KEEPER_TOOL_NAMES);
    await expect(client.startInterview({ familyId, personId })).resolves.toMatchObject({
      interviewId,
    });
    await expect(client.getNextQuestion({ familyId, interviewId })).resolves.toMatchObject({
      questionId,
    });
    await expect(
      client.saveAnswer({ familyId, interviewId, questionId, rawText: 'A memory.' }),
    ).resolves.toEqual({ answerId, status: 'saved' });
    await expect(
      client.getStoryContext({ familyId, actorPersonId: personId }),
    ).resolves.toMatchObject({ visibility: 'narrator_review' });
    await expect(client.listPendingConflicts({ familyId, interviewId })).resolves.toEqual({
      conflicts: [],
    });
    await expect(client.getTimeline({ familyId, actorPersonId: mayaPersonId })).resolves.toEqual({
      items: [],
    });
    await client.disconnect();
    expect(session.close.mock.calls).toHaveLength(1);
  });

  it('fails visibly and closes when tools/list differs from the frozen contract', async () => {
    const session = {
      ...baseSession(),
      listTools: vi.fn(() => Promise.resolve(['start_interview'])),
    };
    const client = new StoryKeeperMcpClient(endpoint, () => session);
    await expect(client.connect()).rejects.toMatchObject({ code: 'tool_contract' });
    expect(session.close.mock.calls).toHaveLength(1);
  });

  it('turns connection failures into a controlled unavailable error', async () => {
    const session = {
      ...baseSession(),
      initialize: vi.fn(() => Promise.reject(new Error('private path'))),
    };
    const client = new StoryKeeperMcpClient(endpoint, () => session);
    await expect(client.connect()).rejects.toEqual(
      new StoryKeeperClientError(
        'unavailable',
        'Story Keeper could not connect to the MCP server.',
      ),
    );
  });

  it('rejects malformed requests and responses at the boundary', async () => {
    const session = {
      ...baseSession(),
      callTool: vi.fn(() => Promise.resolve(result({ unexpected: true }))),
    };
    const client = new StoryKeeperMcpClient(endpoint, () => session);
    await client.connect();
    await expect(client.startInterview({ familyId: 'bad-id', personId })).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(
      client.getTimeline({ familyId, actorPersonId: mayaPersonId }),
    ).rejects.toMatchObject({ code: 'protocol' });
  });

  it('resolves relative and absolute endpoints centrally', () => {
    expect(resolveMcpEndpoint(undefined, 'http://localhost:4173/').href).toBe(
      'http://localhost:4173/mcp',
    );
    expect(resolveMcpEndpoint('https://example.test/mcp', 'http://localhost:4173/').href).toBe(
      'https://example.test/mcp',
    );
  });
});
