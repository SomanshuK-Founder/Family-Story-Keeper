import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FetchLike, Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

import {
  getNextQuestionInputSchema,
  getNextQuestionResultSchema,
  saveAnswerInputSchema,
  saveAnswerResultSchema,
  startInterviewInputSchema,
  startInterviewResultSchema,
  type GetNextQuestionInput,
  type GetNextQuestionResult,
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
  | 'interview_state'
  | 'unexpected';

export class StoryKeeperClientError extends Error {
  public readonly code: StoryKeeperClientErrorCode;

  public constructor(code: StoryKeeperClientErrorCode, message: string) {
    super(message);
    this.name = 'StoryKeeperClientError';
    this.code = code;
  }
}

export interface StoryKeeperInterviewClient {
  connect(): Promise<readonly string[]>;
  reconnect(): Promise<readonly string[]>;
  disconnect(): Promise<void>;
  startInterview(input: StartInterviewInput): Promise<StartInterviewResult>;
  getNextQuestion(input: GetNextQuestionInput): Promise<GetNextQuestionResult>;
  saveAnswer(input: SaveAnswerInput): Promise<SaveAnswerResult>;
}

interface McpSession {
  initialize(): Promise<void>;
  listTools(): Promise<readonly string[]>;
  callTool(name: string, arguments_: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

type McpSessionFactory = (endpoint: URL) => McpSession;

export class StoryKeeperMcpClient implements StoryKeeperInterviewClient {
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

  private async callValidatedTool<TInput extends Record<string, unknown>, TOutput>(
    name: string,
    inputSchema: z.ZodType<TInput>,
    outputSchema: z.ZodType<TOutput>,
    input: TInput,
  ): Promise<TOutput> {
    const session = this.session;
    if (session === undefined) {
      throw new StoryKeeperClientError('unavailable', 'Story Keeper is not connected.');
    }

    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new StoryKeeperClientError('validation', 'The request needs valid interview details.');
    }

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
    if (!parsedOutput.success) {
      throw new StoryKeeperClientError('protocol', 'Story Keeper returned an unexpected response.');
    }
    return parsedOutput.data;
  }
}

class OfficialMcpSession implements McpSession {
  private readonly client = new Client({ name: 'story-keeper-simulator', version: '1.0.0' });
  private readonly transport: StreamableHTTPClientTransport;

  public constructor(endpoint: URL) {
    this.transport = new StreamableHTTPClientTransport(endpoint, { fetch: statelessMcpFetch });
  }

  public async initialize(): Promise<void> {
    // SDK 1.32.1's class and interface differ only in exact-optional session declarations.
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
  // Story Keeper's proven stateless transport supports POST only. The SDK treats a GET 405 as
  // the expected signal that no optional server-to-client SSE stream exists, so avoid a browser
  // network error by providing that signal locally while all protocol messages still use fetch.
  if (init?.method === 'GET') {
    return Promise.resolve(new Response(null, { status: 405, statusText: 'Method Not Allowed' }));
  }
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
      'The Story Keeper tool contract does not match this simulator.',
    );
  }
}

function mapToolError(result: CallToolResult): StoryKeeperClientError {
  const text = result.content.find((item) => item.type === 'text');
  const serverCode = text?.type === 'text' ? /^([A-Z][A-Z0-9_]+):/.exec(text.text)?.[1] : undefined;
  if (serverCode?.includes('AUTH') === true || serverCode?.includes('FAMILY') === true) {
    return new StoryKeeperClientError(
      'authorization',
      'This family member is not authorized for that interview.',
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
  if (serverCode?.includes('VALIDATION') === true) {
    return new StoryKeeperClientError('validation', 'The interview response was not valid.');
  }
  return new StoryKeeperClientError('unexpected', 'Story Keeper could not complete that request.');
}

export function resolveMcpEndpoint(configuredValue: string | undefined, baseUrl: string): URL {
  const value =
    configuredValue?.trim() === '' || configuredValue === undefined ? '/mcp' : configuredValue;
  return new URL(value, baseUrl);
}
