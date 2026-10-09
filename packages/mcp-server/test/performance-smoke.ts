import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { demoShowcaseSeedIds, seedDemoShowcaseData } from '@story-keeper/database';

import { getNextQuestionOutputSchema } from '../src/tool-schemas.js';
import { startTestRuntime } from './runtime.js';

const samples = 30;

const runtime = await startTestRuntime(':memory:');
seedDemoShowcaseData(runtime.database);
const transport = new StreamableHTTPClientTransport(runtime.mcpUrl);
const client = new Client({ name: 'story-keeper-performance-smoke', version: '1.0.0' });

try {
  // SDK 1.32.1's class and interface differ only in exact-optional session declarations.
  await client.connect(transport as Transport);
  const healthUrl = new URL('/health', runtime.mcpUrl);
  const health = await measure(samples, async () => {
    const response = await fetch(healthUrl);
    if (!response.ok) throw new Error('Health check failed.');
  });
  const toolsList = await measure(samples, async () => {
    const tools = await client.listTools();
    if (tools.tools.length !== 15) throw new Error('The frozen tool count changed.');
  });
  const started = runtime.interviewService.startInterview(
    demoShowcaseSeedIds.familyId,
    demoShowcaseSeedIds.rosaPersonId,
  );
  const startInterview = await measure(samples, async () => {
    await client.callTool({
      name: 'start_interview',
      arguments: {
        familyId: demoShowcaseSeedIds.familyId,
        personId: demoShowcaseSeedIds.rosaPersonId,
      },
    });
  });
  const presentationRead = await measure(samples, async () => {
    await client.callTool({
      name: 'get_timeline',
      arguments: {
        familyId: demoShowcaseSeedIds.familyId,
        actorPersonId: demoShowcaseSeedIds.mayaPersonId,
      },
    });
  });
  const search = await measure(samples, async () => {
    await client.callTool({
      name: 'search_family_story',
      arguments: {
        familyId: demoShowcaseSeedIds.familyId,
        actorPersonId: demoShowcaseSeedIds.mayaPersonId,
        query: 'fictional orchard',
      },
    });
  });

  const saveAnswerDurations: number[] = [];
  const getNextDurations: number[] = [];
  let questionId = started.questionId;
  for (let index = 0; index < samples; index += 1) {
    saveAnswerDurations.push(
      await duration(async () => {
        await client.callTool({
          name: 'save_answer',
          arguments: {
            familyId: demoShowcaseSeedIds.familyId,
            interviewId: started.interviewId,
            questionId,
            rawText: `Deterministic performance answer ${String(index + 1)}.`,
          },
        });
      }),
    );
    if (index + 1 < samples) {
      runtime.familyQuestionService.queueFamilyQuestion(
        demoShowcaseSeedIds.familyId,
        demoShowcaseSeedIds.mayaPersonId,
        demoShowcaseSeedIds.rosaPersonId,
        `Deterministic performance question ${String(index + 1)}?`,
      );
      let nextResult: unknown;
      getNextDurations.push(
        await duration(async () => {
          nextResult = await client.callTool({
            name: 'get_next_question',
            arguments: {
              familyId: demoShowcaseSeedIds.familyId,
              interviewId: started.interviewId,
            },
          });
        }),
      );
      const parsed = getNextQuestionOutputSchema.parse(
        (nextResult as { readonly structuredContent?: unknown }).structuredContent,
      );
      if (parsed.questionId === null) throw new Error('Expected a queued performance question.');
      questionId = parsed.questionId;
    }
  }

  const report = {
    samples,
    unit: 'milliseconds',
    operations: {
      health,
      toolsList,
      startInterview,
      saveAnswer: summarize(saveAnswerDurations),
      getNextQuestion: summarize(getNextDurations),
      presentationRead,
      search,
    },
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
  await runtime.close();
}

async function measure(count: number, operation: () => Promise<void>): Promise<Summary> {
  const durations: number[] = [];
  for (let index = 0; index < count; index += 1) durations.push(await duration(operation));
  return summarize(durations);
}

async function duration(operation: () => Promise<void>): Promise<number> {
  const startedAt = performance.now();
  await operation();
  return performance.now() - startedAt;
}

interface Summary {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

function summarize(values: readonly number[]): Summary {
  const sorted = values.toSorted((left, right) => left - right);
  if (sorted.length === 0) throw new Error('At least one latency sample is required.');
  return {
    count: sorted.length,
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1) ?? 0),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
