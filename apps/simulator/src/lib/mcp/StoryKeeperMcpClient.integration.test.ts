// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { storyKeeperDemoIds } from '@story-keeper/shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  startTestRuntime,
  type TestRuntime,
} from '../../../../../packages/mcp-server/test/runtime.js';
import { STORY_KEEPER_TOOL_NAMES, StoryKeeperMcpClient } from './StoryKeeperMcpClient.js';

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
