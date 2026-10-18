import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FetchLike, Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PresentationReadInput, TimelineResponse } from '@story-keeper/shared';
import type { z } from 'zod';

import {
  getNextQuestionInputSchema,
  getNextQuestionResultSchema,
  getStoryContextInputSchema,
  getStoryContextResultSchema,
  listPendingConflictsInputSchema,
  listPendingConflictsResultSchema,
  presentationReadInputSchema,
  resolveConflictInputSchema,
  resolveConflictResultSchema,
  saveAnswerInputSchema,
  saveAnswerResultSchema,
  startInterviewInputSchema,
  startInterviewResultSchema,
  timelineResponseSchema,
  type GetNextQuestionInput,
  type GetNextQuestionResult,
  type GetStoryContextInput,
  type GetStoryContextResult,
  type ListPendingConflictsInput,
  type ListPendingConflictsResult,
  type ResolveConflictInput,
  type ResolveConflictResult,
  type SaveAnswerInput,
  type SaveAnswerResult,
  type StartInterviewInput,
  type StartInterviewResult,
} from './contracts.js';

export const ALEXA_MCP_PROTOCOL_VERSION = '2025-11-25';

export const STORY_KEEPER_TOOL_NAMES = [
  'start_interview',
  'save_answer',
  'get_next_question',
  'list_pending_conflicts',
  'resolve_conflict',
  'get_story_context',
  'approve_story_item',
  'delete_pending_memory',
  'queue_family_question',
  'request_chapter_draft',
  'review_chapter',
  'get_timeline',
  'get_family_graph',
  'get_approved_chapters',
  'search_family_story',
] as const;

export type StoryKeeperClientErrorCode =
  | 'unavailable'
  | 'protocol'
  | 'tool_contract'
  | 'validation'
  | 'authorization'
  | 'conflict_state'
  | 'interview_state'
  | 'unexpected';

export class StoryKeeperClientError extends Error {
  public constructor(
    public readonly code: StoryKeeperClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoryKeeperClientError';
  }
}

export interface StoryKeeperClient {
  connect(): Promise<readonly string[]>;
  reconnect(): Promise<readonly string[]>;
  disconnect(): Promise<void>;
  startInterview(input: StartInterviewInput): Promise<StartInterviewResult>;
  getNextQuestion(input: GetNextQuestionInput): Promise<GetNextQuestionResult>;
  saveAnswer(input: SaveAnswerInput): Promise<SaveAnswerResult>;
  getStoryContext(input: GetStoryContextInput): Promise<GetStoryContextResult>;
  listPendingConflicts(input: ListPendingConflictsInput): Promise<ListPendingConflictsResult>;
  resolveConflict(input: ResolveConflictInput): Promise<ResolveConflictResult>;
  getTimeline(input: PresentationReadInput): Promise<TimelineResponse>;
}

export interface McpSession {
  initialize(): Promise<void>;
  listTools(): Promise<readonly string[]>;
  callTool(name: string, arguments_: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

type McpSessionFactory = (endpoint: URL) => McpSession;

export class StoryKeeperMcpClient implements StoryKeeperClient {
  private session: McpSession | undefined;

  public constructor(
    private readonly endpoint: URL,
    private readonly createSession: McpSessionFactory = createOfficialMcpSession,
  ) {}

  public async connect(): Promise<readonly string[]> {
    await this.disconnect();
    const session = this.createSession(this.endpoint);
    try {
      await session.initialize();
      const tools = await session.listTools();
      assertFrozenToolSet(tools);
      this.session = session;
      return tools;
    } catch (error: unknown) {
      await session.close().catch(() => undefined);
      if (error instanceof StoryKeeperClientError) throw error;
      throw new StoryKeeperClientError(
        'unavailable',
        'Story Keeper could not connect to the MCP server.',
      );
    }
  }

  public async reconnect(): Promise<readonly string[]> {
    await this.disconnect();
    return this.connect();
  }

  public async disconnect(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    await session?.close();
  }

  public startInterview(input: StartInterviewInput): Promise<StartInterviewResult> {
    return this.callValidatedTool(
      'start_interview',
      startInterviewInputSchema,
      startInterviewResultSchema,
      input,
    );
  }

  public getNextQuestion(input: GetNextQuestionInput): Promise<GetNextQuestionResult> {
    return this.callValidatedTool(
      'get_next_question',
      getNextQuestionInputSchema,
      getNextQuestionResultSchema,
      input,
    );
  }

  public saveAnswer(input: SaveAnswerInput): Promise<SaveAnswerResult> {
    return this.callValidatedTool(
      'save_answer',
      saveAnswerInputSchema,
      saveAnswerResultSchema,
      input,
    );
  }

  public getStoryContext(input: GetStoryContextInput): Promise<GetStoryContextResult> {
    return this.callValidatedTool(
      'get_story_context',
      getStoryContextInputSchema,
      getStoryContextResultSchema,
      input,
    );
  }

  public listPendingConflicts(
    input: ListPendingConflictsInput,
  ): Promise<ListPendingConflictsResult> {
    return this.callValidatedTool(
      'list_pending_conflicts',
      listPendingConflictsInputSchema,
      listPendingConflictsResultSchema,
      input,
    );
  }

  public resolveConflict(input: ResolveConflictInput): Promise<ResolveConflictResult> {
    return this.callValidatedTool(
      'resolve_conflict',
      resolveConflictInputSchema,
      resolveConflictResultSchema,
      input,
    );
  }

  public getTimeline(input: PresentationReadInput): Promise<TimelineResponse> {
    return this.callValidatedTool(
      'get_timeline',
      presentationReadInputSchema,
      timelineResponseSchema,
      input,
    );
  }

  private async callValidatedTool<TInput extends Record<string, unknown>, TOutput>(
    name: string,
    inputSchema: z.ZodType<TInput>,
    outputSchema: z.ZodType<TOutput>,
    input: TInput,
  ): Promise<TOutput> {
    const session = this.session;
    if (session === undefined)
      throw new StoryKeeperClientError('unavailable', 'Story Keeper is not connected.');
    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success)
      throw new StoryKeeperClientError('validation', 'The request details are not valid.');

    let result: CallToolResult;
    try {
      result = await session.callTool(name, parsedInput.data);
    } catch {
      throw new StoryKeeperClientError(
        'unavailable',
        'The connection to Story Keeper was interrupted.',
      );
    }
    if (result.isError === true) throw mapToolError(result);
    const parsedOutput = outputSchema.safeParse(result.structuredContent);
    if (!parsedOutput.success)
      throw new StoryKeeperClientError('protocol', 'Story Keeper returned an unexpected response.');
    return parsedOutput.data;
  }
}

class OfficialMcpSession implements McpSession {
  private readonly client = new Client({ name: 'story-keeper-browser', version: '1.0.0' });
  private readonly transport: StreamableHTTPClientTransport;

  public constructor(endpoint: URL) {
    this.transport = new StreamableHTTPClientTransport(endpoint, { fetch: statelessMcpFetch });
  }

  public async initialize(): Promise<void> {
    await this.client.connect(this.transport as Transport);
    if (this.transport.protocolVersion !== ALEXA_MCP_PROTOCOL_VERSION) {
      throw new StoryKeeperClientError(
        'protocol',
        'Story Keeper negotiated an unsupported MCP protocol version.',
      );
    }
  }

  public async listTools(): Promise<readonly string[]> {
    const response = await this.client.listTools();
    return response.tools.map(({ name }) => name);
  }

  public async callTool(
    name: string,
    arguments_: Record<string, unknown>,
  ): Promise<CallToolResult> {
    return CallToolResultSchema.parse(await this.client.callTool({ name, arguments: arguments_ }));
  }

  public async close(): Promise<void> {
    await this.client.close();
  }
}

const statelessMcpFetch: FetchLike = (url, init) => {
  if (init?.method === 'GET')
    return Promise.resolve(new Response(null, { status: 405, statusText: 'Method Not Allowed' }));
  return fetch(url, init);
};

function createOfficialMcpSession(endpoint: URL): McpSession {
  return new OfficialMcpSession(endpoint);
}

function assertFrozenToolSet(actualTools: readonly string[]): void {
  const expected = [...STORY_KEEPER_TOOL_NAMES].sort();
  const actual = [...actualTools].sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new StoryKeeperClientError(
      'tool_contract',
      'The Story Keeper tool contract does not match this browser.',
    );
  }
}

function mapToolError(result: CallToolResult): StoryKeeperClientError {
  const text = result.content.find((item) => item.type === 'text');
  const serverCode = text?.type === 'text' ? /^([A-Z][A-Z0-9_]+):/.exec(text.text)?.[1] : undefined;
  if (serverCode?.includes('AUTH') === true || serverCode?.includes('FAMILY') === true) {
    return new StoryKeeperClientError(
      'authorization',
      'This family member is not authorized for that information.',
    );
  }
  if (
    serverCode?.includes('INTERVIEW') === true ||
    serverCode?.includes('QUESTION') === true ||
    serverCode?.includes('ANSWER') === true
  ) {
    return new StoryKeeperClientError(
      'interview_state',
      'The interview state changed. Resume the interview and try again.',
    );
  }
  if (serverCode === 'CONFLICT_ALREADY_RESOLVED' || serverCode === 'CONTRADICTION_NOT_FOUND') {
    return new StoryKeeperClientError(
      'conflict_state',
      'This conflict changed since it was loaded.',
    );
  }
  if (serverCode === 'INVALID_CONFLICT_RESOLUTION') {
    return new StoryKeeperClientError(
      'validation',
      'That resolution is not available for this conflict.',
    );
  }
  if (serverCode?.includes('VALIDATION') === true)
    return new StoryKeeperClientError('validation', 'The Story Keeper request was not valid.');
  return new StoryKeeperClientError('unexpected', 'Story Keeper could not complete that request.');
}

export function resolveMcpEndpoint(configuredValue: string | undefined, baseUrl: string): URL {
  const value =
    configuredValue?.trim() === '' || configuredValue === undefined ? '/mcp' : configuredValue;
  return new URL(value, baseUrl);
}
