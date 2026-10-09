import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolResultSchema,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';
import { demoSeedIds, DrizzleStoryMemoryRepository } from '@story-keeper/database';
import { afterEach, describe, expect, it } from 'vitest';

import { ALEXA_MCP_PROTOCOL_VERSION } from '../src/protocol.js';
import {
  getNextQuestionOutputSchema,
  listPendingConflictsOutputSchema,
  resolveConflictOutputSchema,
  saveAnswerOutputSchema,
  startInterviewOutputSchema,
} from '../src/tool-schemas.js';
import { startTestRuntime, type TestRuntime } from './runtime.js';

interface ConnectedClient {
  readonly client: Client;
  readonly transport: StreamableHTTPClientTransport;
}

const temporaryDirectories: string[] = [];
const openClients: Client[] = [];
const openRuntimes: TestRuntime[] = [];

afterEach(async () => {
  await Promise.allSettled(openClients.splice(0).map(async (client) => client.close()));
  await Promise.allSettled(openRuntimes.splice(0).map(async (runtime) => runtime.close()));
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('MCP Streamable HTTP integration', () => {
  it('negotiates 2025-11-25 and exposes exactly the Phase 4 tools', async () => {
    const runtime = await createRuntime(':memory:');
    const { client, transport } = await connectClient(runtime.mcpUrl);

    expect(LATEST_PROTOCOL_VERSION).toBe(ALEXA_MCP_PROTOCOL_VERSION);
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(ALEXA_MCP_PROTOCOL_VERSION);
    expect(transport.protocolVersion).toBe(ALEXA_MCP_PROTOCOL_VERSION);

    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name).sort()).toEqual([
      'get_next_question',
      'list_pending_conflicts',
      'resolve_conflict',
      'save_answer',
      'start_interview',
    ]);
  });

  it('calls all Story Keeper tools and rejects malformed or unknown calls', async () => {
    const runtime = await createRuntime(':memory:');
    const { client } = await connectClient(runtime.mcpUrl);
    const started = startInterviewOutputSchema.parse(
      (
        await client.callTool({
          name: 'start_interview',
          arguments: {
            familyId: demoSeedIds.familyId,
            personId: demoSeedIds.rosaPersonId,
          },
        })
      ).structuredContent,
    );

    const saved = saveAnswerOutputSchema.parse(
      (
        await client.callTool({
          name: 'save_answer',
          arguments: {
            familyId: demoSeedIds.familyId,
            interviewId: started.interviewId,
            questionId: started.questionId,
            rawText: 'The street had a large banyan tree.',
          },
        })
      ).structuredContent,
    );
    expect(saved.status).toBe('saved');

    const memory = new DrizzleStoryMemoryRepository(runtime.database);
    const left = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1962',
      confidence: 0.9,
      answerId: saved.answerId,
    }).fact;
    const right = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1964',
      confidence: 0.9,
      answerId: saved.answerId,
    }).fact;
    const contradiction = memory.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });

    const pending = listPendingConflictsOutputSchema.parse(
      (
        await client.callTool({
          name: 'list_pending_conflicts',
          arguments: { familyId: demoSeedIds.familyId, interviewId: started.interviewId },
        })
      ).structuredContent,
    );
    expect(pending.conflicts).toEqual([
      expect.objectContaining({ contradictionId: contradiction.id, status: 'unresolved' }),
    ]);

    const resolved = resolveConflictOutputSchema.parse(
      (
        await client.callTool({
          name: 'resolve_conflict',
          arguments: {
            familyId: demoSeedIds.familyId,
            interviewId: started.interviewId,
            contradictionId: contradiction.id,
            resolutionType: 'keep_left',
          },
        })
      ).structuredContent,
    );
    expect(resolved).toMatchObject({
      contradictionId: contradiction.id,
      status: 'resolved',
      resolutionType: 'keep_left',
    });

    const nextResult = await client.callTool({
      name: 'get_next_question',
      arguments: {
        familyId: demoSeedIds.familyId,
        interviewId: started.interviewId,
      },
    });
    expect(nextResult.structuredContent).toBeDefined();
    const next = getNextQuestionOutputSchema.parse(nextResult.structuredContent);
    expect(next).toMatchObject({ status: 'question', interviewId: started.interviewId });

    const invalid = await client.callTool({
      name: 'save_answer',
      arguments: {
        familyId: demoSeedIds.familyId,
        interviewId: started.interviewId,
        questionId: started.questionId,
        rawText: '   ',
      },
    });
    expect(invalid.isError).toBe(true);

    const invalidId = await client.callTool({
      name: 'start_interview',
      arguments: { familyId: 'not-an-opaque-id', personId: demoSeedIds.rosaPersonId },
    });
    expect(invalidId.isError).toBe(true);

    const invalidResolution = await client.callTool({
      name: 'resolve_conflict',
      arguments: {
        familyId: demoSeedIds.familyId,
        interviewId: started.interviewId,
        contradictionId: contradiction.id,
        resolutionType: 'corrected_value',
      },
    });
    expect(invalidResolution.isError).toBe(true);

    const unknown = CallToolResultSchema.parse(
      await client.callTool({
        name: 'unknown_story_keeper_tool',
        arguments: {},
      }),
    );
    expect(unknown.isError).toBe(true);
    const unknownContent = unknown.content[0];
    expect(unknownContent?.type).toBe('text');
    if (unknownContent?.type === 'text') {
      expect(unknownContent.text).toContain('Tool unknown_story_keeper_tool not found');
    }
  });

  it('preserves interview and answer state across client reconnect and server restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-mcp-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'persistent.sqlite');
    const firstRuntime = await createRuntime(databasePath);
    const firstConnection = await connectClient(firstRuntime.mcpUrl);

    const started = startInterviewOutputSchema.parse(
      (
        await firstConnection.client.callTool({
          name: 'start_interview',
          arguments: {
            familyId: demoSeedIds.familyId,
            personId: demoSeedIds.rosaPersonId,
          },
        })
      ).structuredContent,
    );
    const rawText = '  The houses were painted blue and yellow.  ';
    const saved = saveAnswerOutputSchema.parse(
      (
        await firstConnection.client.callTool({
          name: 'save_answer',
          arguments: {
            familyId: demoSeedIds.familyId,
            interviewId: started.interviewId,
            questionId: started.questionId,
            rawText,
          },
        })
      ).structuredContent,
    );

    await closeClient(firstConnection.client);
    const secondConnection = await connectClient(firstRuntime.mcpUrl);
    const resumedAfterReconnect = startInterviewOutputSchema.parse(
      (
        await secondConnection.client.callTool({
          name: 'start_interview',
          arguments: {
            familyId: demoSeedIds.familyId,
            personId: demoSeedIds.rosaPersonId,
          },
        })
      ).structuredContent,
    );

    expect(resumedAfterReconnect.interviewId).toBe(started.interviewId);
    expect(resumedAfterReconnect.questionId).not.toBe(started.questionId);
    expect(
      firstRuntime.repository.findAnswerByQuestion(
        demoSeedIds.familyId,
        started.interviewId,
        started.questionId,
      ),
    ).toEqual({ id: saved.answerId, rawText });

    await closeClient(secondConnection.client);
    await closeRuntime(firstRuntime);
    const restartedRuntime = await createRuntime(databasePath);
    const thirdConnection = await connectClient(restartedRuntime.mcpUrl);
    const resumedAfterRestart = startInterviewOutputSchema.parse(
      (
        await thirdConnection.client.callTool({
          name: 'start_interview',
          arguments: {
            familyId: demoSeedIds.familyId,
            personId: demoSeedIds.rosaPersonId,
          },
        })
      ).structuredContent,
    );

    expect(resumedAfterRestart.interviewId).toBe(started.interviewId);
    expect(resumedAfterRestart.questionId).toBe(resumedAfterReconnect.questionId);
    expect(thirdConnection.transport.sessionId).toBeUndefined();
  });

  it('returns scoped public errors without private implementation details', async () => {
    const runtime = await createRuntime(':memory:');
    const { client } = await connectClient(runtime.mcpUrl);
    const result = CallToolResultSchema.parse(
      await client.callTool({
        name: 'start_interview',
        arguments: { familyId: crypto.randomUUID(), personId: demoSeedIds.rosaPersonId },
      }),
    );
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';

    expect(result.isError).toBe(true);
    expect(text).toContain('FAMILY_NOT_FOUND');
    expect(text).not.toMatch(/sqlite|select|insert|[A-Z]:\\/i);
  });
});

async function createRuntime(databasePath: string): Promise<TestRuntime> {
  const runtime = await startTestRuntime(databasePath);
  openRuntimes.push(runtime);
  return runtime;
}

async function connectClient(mcpUrl: URL): Promise<ConnectedClient> {
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  const client = new Client({ name: 'story-keeper-phase-one-test', version: '1.0.0' });
  // SDK 1.32.1's class and interface differ only in exact-optional session declarations.
  await client.connect(transport as Transport);
  openClients.push(client);
  return { client, transport };
}

async function closeClient(client: Client): Promise<void> {
  const index = openClients.indexOf(client);
  if (index >= 0) openClients.splice(index, 1);
  await client.close();
}

async function closeRuntime(runtime: TestRuntime): Promise<void> {
  const index = openRuntimes.indexOf(runtime);
  if (index >= 0) openRuntimes.splice(index, 1);
  await runtime.close();
}
