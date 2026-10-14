// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { storyKeeperDemoIds } from '@story-keeper/shared';
import { STORY_KEEPER_TOOL_NAMES, StoryKeeperMcpClient } from '@story-keeper/mcp-client';
import { MockStoryExtractionProvider } from '@story-keeper/bedrock';
import {
  DrizzleExtractionRepository,
  DrizzleJobRepository,
  DrizzleStoryMemoryRepository,
  seedDemoShowcaseData,
} from '@story-keeper/database';
import { ExtractionWorker } from '@story-keeper/story-engine';
import { afterEach, describe, expect, it } from 'vitest';

import {
  startTestRuntime,
  type TestRuntime,
} from '../../../../../packages/mcp-server/test/runtime.js';

const clients: StoryKeeperMcpClient[] = [];
const runtimes: TestRuntime[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map(async (client) => client.disconnect()));
  await Promise.allSettled(runtimes.splice(0).map(async (runtime) => runtime.close()));
  directories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

describe('StoryKeeperMcpClient real server integration', () => {
  it('initializes, discovers 15 tools, saves, and resumes durable state with a new client', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-person-b-phase-1-'));
    directories.push(directory);
    const runtime = await startTestRuntime(join(directory, 'interview.sqlite'));
    runtimes.push(runtime);
    seedDemoShowcaseData(runtime.database);

    const firstClient = new StoryKeeperMcpClient(runtime.mcpUrl);
    clients.push(firstClient);
    await expect(firstClient.connect()).resolves.toEqual(STORY_KEEPER_TOOL_NAMES);
    const started = await firstClient.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.rosaPersonId,
    });
    const current = await firstClient.getNextQuestion({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: started.interviewId,
    });
    expect(current).toMatchObject({ status: 'question', questionId: started.questionId });

    const rawText = '  The porch smelled like jasmine after the rain.  ';
    const saved = await firstClient.saveAnswer({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: started.interviewId,
      questionId: started.questionId,
      rawText,
    });
    const memory = new DrizzleStoryMemoryRepository(runtime.database);
    const worker = new ExtractionWorker(
      new DrizzleJobRepository(runtime.database),
      new DrizzleExtractionRepository(runtime.database),
      memory,
      new MockStoryExtractionProvider({
        people: [],
        relationships: [],
        places: [],
        dateMentions: [],
        followUpCandidates: [],
        events: [
          {
            subjectReference: 'narrator',
            eventType: 'move',
            title: 'Moved near the old market',
            description: 'Rosa remembered moving near the market.',
            date: { earliestYear: 1962, latestYear: 1964, precision: 'range' },
            confidence: 0.9,
          },
        ],
        factCandidates: [
          {
            subjectReference: 'narrator',
            factType: 'move_year',
            normalizedValue: '1962',
            confidence: 0.9,
            sourceLocator: null,
          },
        ],
      }),
      { workerId: 'phase-2-client-integration', retryDelayMs: 0 },
    );
    expect(await worker.processNext()).toBe('succeeded');
    const left = memory.listFacts(storyKeeperDemoIds.familyId)[0];
    const event = memory.listTimelineEvents(storyKeeperDemoIds.familyId)[0];
    if (left === undefined || event === undefined)
      throw new Error('Expected extracted test memory.');
    const right = memory.createFactWithSource({
      familyId: storyKeeperDemoIds.familyId,
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1964',
      confidence: 0.9,
      answerId: saved.answerId,
    }).fact;
    memory.createContradiction({
      familyId: storyKeeperDemoIds.familyId,
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });
    runtime.privacyService.approveStoryItem(
      storyKeeperDemoIds.familyId,
      storyKeeperDemoIds.rosaPersonId,
      'timeline_event',
      event.id,
      'approve',
    );

    const rosaContext = await firstClient.getStoryContext({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
    });
    expect(rosaContext.facts.map(({ value }) => value)).toEqual(['1962', '1964']);
    const mayaContext = await firstClient.getStoryContext({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.mayaPersonId,
    });
    expect(mayaContext.facts).toEqual([]);
    expect(mayaContext.timelineEvents).toHaveLength(1);
    await expect(
      firstClient.listPendingConflicts({
        familyId: storyKeeperDemoIds.familyId,
        interviewId: started.interviewId,
      }),
    ).resolves.toMatchObject({ conflicts: [{ status: 'unresolved' }] });
    await expect(
      firstClient.getTimeline({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.mayaPersonId,
      }),
    ).resolves.toMatchObject({
      items: [
        { title: 'Moved near the old market', status: 'approved', date: { precision: 'range' } },
      ],
    });
    await firstClient.disconnect();
    clients.splice(clients.indexOf(firstClient), 1);

    const secondClient = new StoryKeeperMcpClient(runtime.mcpUrl);
    clients.push(secondClient);
    await secondClient.connect();
    const resumed = await secondClient.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.rosaPersonId,
    });
    const resumedQuestion = await secondClient.getNextQuestion({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: resumed.interviewId,
    });

    expect(resumed.interviewId).toBe(started.interviewId);
    expect(resumed.questionId).not.toBe(started.questionId);
    expect(resumedQuestion).toMatchObject({ status: 'question', questionId: resumed.questionId });
    expect(
      runtime.repository.findAnswerByQuestion(
        storyKeeperDemoIds.familyId,
        started.interviewId,
        started.questionId,
      ),
    ).toEqual({ id: saved.answerId, rawText });
  });
});
