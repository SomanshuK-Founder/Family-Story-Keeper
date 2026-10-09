import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Router, type Response } from 'express';

import { StoryKeeperError } from '@story-keeper/story-engine';
import type { InterviewService, NarratorMemoryService } from '@story-keeper/story-engine';

import { assertAlexaMcpCompatibility } from './protocol.js';
import {
  getNextQuestionInputSchema,
  getNextQuestionOutputSchema,
  listPendingConflictsInputSchema,
  listPendingConflictsOutputSchema,
  resolveConflictInputSchema,
  resolveConflictOutputSchema,
  saveAnswerInputSchema,
  saveAnswerOutputSchema,
  startInterviewInputSchema,
  startInterviewOutputSchema,
} from './tool-schemas.js';

export function createStoryKeeperMcpServer(
  interviewService: InterviewService,
  narratorMemoryService: NarratorMemoryService,
): McpServer {
  assertAlexaMcpCompatibility();

  const server = new McpServer({
    name: 'family-story-keeper',
    version: '0.1.0',
  });

  server.registerTool(
    'start_interview',
    {
      description: 'Start or resume a durable interview for a family member.',
      inputSchema: startInterviewInputSchema,
      outputSchema: startInterviewOutputSchema,
    },
    ({ familyId, personId }) =>
      executeTool(() => interviewService.startInterview(familyId, personId)),
  );

  server.registerTool(
    'save_answer',
    {
      description: 'Persist a raw answer for a question in a durable interview.',
      inputSchema: saveAnswerInputSchema,
      outputSchema: saveAnswerOutputSchema,
    },
    ({ familyId, interviewId, questionId, rawText }) =>
      executeTool(() => interviewService.saveAnswer(familyId, interviewId, questionId, rawText)),
  );

  server.registerTool(
    'get_next_question',
    {
      description: 'Return the current unanswered or next deterministic interview question.',
      inputSchema: getNextQuestionInputSchema,
      outputSchema: getNextQuestionOutputSchema,
    },
    ({ familyId, interviewId }) =>
      executeTool(() => interviewService.getNextQuestion(familyId, interviewId)),
  );

  server.registerTool(
    'list_pending_conflicts',
    {
      description: 'List unresolved source-backed contradictions for the interview narrator.',
      inputSchema: listPendingConflictsInputSchema,
      outputSchema: listPendingConflictsOutputSchema,
    },
    ({ familyId, interviewId }) =>
      executeTool(() => narratorMemoryService.listPendingConflicts(familyId, interviewId)),
  );

  server.registerTool(
    'resolve_conflict',
    {
      description: 'Record the interview narrator’s explicit resolution of a contradiction.',
      inputSchema: resolveConflictInputSchema,
      outputSchema: resolveConflictOutputSchema,
    },
    ({ familyId, interviewId, contradictionId, resolutionType }) =>
      executeTool(() =>
        narratorMemoryService.resolveConflict(
          familyId,
          interviewId,
          contradictionId,
          resolutionType,
        ),
      ),
  );

  return server;
}

export function createMcpRouter(
  interviewService: InterviewService,
  narratorMemoryService: NarratorMemoryService,
): Router {
  const router = Router();

  router.post('/', async (request, response) => {
    const server = createStoryKeeperMcpServer(interviewService, narratorMemoryService);
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });

    response.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      // SDK 1.32.1's class and interface differ only in exact-optional callback declarations.
      await server.connect(transport as Transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error: unknown) {
      logSafeMcpError(error);
      sendInternalError(response);
    }
  });

  router.get('/', (_request, response) => {
    sendMethodNotAllowed(response);
  });

  router.delete('/', (_request, response) => {
    sendMethodNotAllowed(response);
  });

  return router;
}

function executeTool(operation: () => object): CallToolResult {
  try {
    const result = operation();
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: Object.fromEntries(Object.entries(result)),
    };
  } catch (error: unknown) {
    if (error instanceof StoryKeeperError) {
      return {
        isError: true,
        content: [{ type: 'text', text: `${error.code}: ${error.message}` }],
      };
    }

    logSafeMcpError(error);
    return {
      isError: true,
      content: [{ type: 'text', text: 'INTERNAL_ERROR: The request could not be completed.' }],
    };
  }
}

function sendMethodNotAllowed(response: Response): void {
  response
    .status(405)
    .set('Allow', 'POST')
    .json({
      jsonrpc: '2.0',
      error: { code: -32_000, message: 'Method not allowed.' },
      id: null,
    });
}

function sendInternalError(response: Response): void {
  if (!response.headersSent) {
    response.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32_603, message: 'Internal server error.' },
      id: null,
    });
  }
}

function logSafeMcpError(error: unknown): void {
  console.error(
    JSON.stringify({
      level: 'error',
      operation: 'mcp.request',
      errorCategory: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
}
