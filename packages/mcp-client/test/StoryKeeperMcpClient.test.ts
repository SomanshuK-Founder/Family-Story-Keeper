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
const candidatePersonId = '10000000-0000-4000-8000-000000000004';

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
            personIdentities: [
              { personId, status: 'confirmed', displayName: 'Rosa' },
              {
                personId: candidatePersonId,
                status: 'unresolved',
                extractedDisplayName: 'Raj',
                possibleMatchDisplayName: 'Raj Sharma',
              },
            ],
            facts: [],
            relationships: [],
            timelineEvents: [],
            chapters: [],
            conflicts: [],
          }),
        );
      if (name === 'list_pending_conflicts') return Promise.resolve(result({ conflicts: [] }));
      if (name === 'resolve_conflict')
        return Promise.resolve(
          result({
            contradictionId: candidatePersonId,
            status: 'resolved',
            resolutionType: 'keep_left',
            resolvedByPersonId: personId,
            resolvedAt: '2026-01-01T00:00:00.000Z',
          }),
        );
      if (name === 'approve_story_item')
        return Promise.resolve(
          result({
            targetType: 'fact',
            targetId: candidatePersonId,
            action: 'approve',
            status: 'updated',
            itemStatus: 'approved',
          }),
        );
      if (name === 'delete_pending_memory')
        return Promise.resolve(
          result({
            targetType: 'fact',
            targetId: candidatePersonId,
            status: 'deleted',
            itemStatus: 'rejected',
          }),
        );
      if (name === 'queue_family_question')
        return Promise.resolve(
          result({
            queuedQuestionId: candidatePersonId,
            status: 'queued',
          }),
        );
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
    ).resolves.toMatchObject({
      visibility: 'narrator_review',
      personIdentities: [
        { status: 'confirmed', displayName: 'Rosa' },
        {
          status: 'unresolved',
          extractedDisplayName: 'Raj',
          possibleMatchDisplayName: 'Raj Sharma',
        },
      ],
    });
    await expect(client.listPendingConflicts({ familyId, interviewId })).resolves.toEqual({
      conflicts: [],
    });
    await expect(
      client.resolveConflict({
        familyId,
        interviewId,
        contradictionId: candidatePersonId,
        resolutionType: 'keep_left',
      }),
    ).resolves.toMatchObject({ status: 'resolved', resolutionType: 'keep_left' });
    await expect(
      client.approveStoryItem({
        familyId,
        actorPersonId: personId,
        targetType: 'fact',
        targetId: candidatePersonId,
        action: 'approve',
      }),
    ).resolves.toMatchObject({ status: 'updated', itemStatus: 'approved' });
    await expect(
      client.deletePendingMemory({
        familyId,
        actorPersonId: personId,
        targetType: 'fact',
        targetId: candidatePersonId,
      }),
    ).resolves.toMatchObject({ status: 'deleted', itemStatus: 'rejected' });
    await expect(
      client.queueFamilyQuestion({
        familyId,
        fromPersonId: mayaPersonId,
        toPersonId: personId,
        questionText: '  What was your first job?  ',
      }),
    ).resolves.toEqual({ queuedQuestionId: candidatePersonId, status: 'queued' });
    expect(session.callTool).toHaveBeenCalledWith('queue_family_question', {
      familyId,
      fromPersonId: mayaPersonId,
      toPersonId: personId,
      questionText: 'What was your first job?',
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

  it('maps conflict state and invalid-resolution errors to safe categories', async () => {
    const staleSession = {
      ...baseSession(),
      callTool: vi.fn(() =>
        Promise.resolve({
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'CONFLICT_ALREADY_RESOLVED: private backend details',
            },
          ],
        }),
      ),
    };
    const staleClient = new StoryKeeperMcpClient(endpoint, () => staleSession);
    await staleClient.connect();
    await expect(
      staleClient.resolveConflict({
        familyId,
        interviewId,
        contradictionId: candidatePersonId,
        resolutionType: 'keep_right',
      }),
    ).rejects.toEqual(
      new StoryKeeperClientError('conflict_state', 'This conflict changed since it was loaded.'),
    );

    const invalidSession = {
      ...baseSession(),
      callTool: vi.fn(() =>
        Promise.resolve({
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'INVALID_CONFLICT_RESOLUTION: private backend details',
            },
          ],
        }),
      ),
    };
    const invalidClient = new StoryKeeperMcpClient(endpoint, () => invalidSession);
    await invalidClient.connect();
    await expect(
      invalidClient.resolveConflict({
        familyId,
        interviewId,
        contradictionId: candidatePersonId,
        resolutionType: 'different_events',
      }),
    ).rejects.toEqual(
      new StoryKeeperClientError(
        'validation',
        'That resolution is not available for this conflict.',
      ),
    );
  });

  it.each([
    ['STORY_ITEM_STATE_CONFLICT', 'story_item_state', 'This memory changed since it was loaded.'],
    [
      'STORY_ITEM_PROVENANCE_REQUIRED',
      'provenance',
      'This memory cannot be approved yet because its source information is incomplete.',
    ],
    [
      'STORY_ITEM_IDENTITY_UNRESOLVED',
      'identity',
      'This relationship cannot be approved until its person references are resolved.',
    ],
    [
      'STORY_ITEM_NOT_RELEVANT',
      'authorization',
      'This family member is not authorized to change that memory.',
    ],
  ] as const)('maps %s to a safe approval error', async (serverCode, code, message) => {
    const session = {
      ...baseSession(),
      callTool: vi.fn(() =>
        Promise.resolve({
          isError: true,
          content: [{ type: 'text' as const, text: `${serverCode}: private backend details` }],
        }),
      ),
    };
    const client = new StoryKeeperMcpClient(endpoint, () => session);
    await client.connect();

    await expect(
      client.approveStoryItem({
        familyId,
        actorPersonId: personId,
        targetType: 'fact',
        targetId: candidatePersonId,
        action: 'approve',
      }),
    ).rejects.toEqual(new StoryKeeperClientError(code, message));
  });

  it('validates the exact family-question input and output boundary', async () => {
    const invalidOutputSession = {
      ...baseSession(),
      callTool: vi.fn(() => Promise.resolve(result({ status: 'queued' }))),
    };
    const invalidOutputClient = new StoryKeeperMcpClient(endpoint, () => invalidOutputSession);
    await invalidOutputClient.connect();
    await expect(
      invalidOutputClient.queueFamilyQuestion({
        familyId,
        fromPersonId: mayaPersonId,
        toPersonId: personId,
        questionText: 'A valid question?',
      }),
    ).rejects.toEqual(
      new StoryKeeperClientError('protocol', 'Story Keeper returned an unexpected response.'),
    );

    const inputSession = baseSession();
    const inputClient = new StoryKeeperMcpClient(endpoint, () => inputSession);
    await inputClient.connect();
    await expect(
      inputClient.queueFamilyQuestion({
        familyId,
        fromPersonId: mayaPersonId,
        toPersonId: personId,
        questionText: ' '.repeat(2),
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      inputClient.queueFamilyQuestion({
        familyId,
        fromPersonId: mayaPersonId,
        toPersonId: personId,
        questionText: 'x'.repeat(501),
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(inputSession.callTool).not.toHaveBeenCalled();
  });

  it.each([
    ['QUESTION_TEXT_INVALID', 'validation', 'Enter a question between 1 and 500 characters.'],
    [
      'QUESTION_SENDER_NOT_ALLOWED',
      'authorization',
      'This family question cannot be sent for that person.',
    ],
    [
      'QUESTION_TARGET_NOT_NARRATOR',
      'authorization',
      'This family question cannot be sent for that person.',
    ],
  ] as const)('maps %s to a safe family-question error', async (serverCode, code, message) => {
    const session = {
      ...baseSession(),
      callTool: vi.fn(() =>
        Promise.resolve({
          isError: true,
          content: [{ type: 'text' as const, text: `${serverCode}: private backend details` }],
        }),
      ),
    };
    const client = new StoryKeeperMcpClient(endpoint, () => session);
    await client.connect();

    await expect(
      client.queueFamilyQuestion({
        familyId,
        fromPersonId: mayaPersonId,
        toPersonId: personId,
        questionText: 'What was your first job?',
      }),
    ).rejects.toEqual(new StoryKeeperClientError(code, message));
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
