// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  StoryKeeperClientError,
  StoryKeeperMcpClient,
  type ResolveConflictInput,
} from '@story-keeper/mcp-client';
import {
  DrizzleJobRepository,
  DrizzleStoryMemoryRepository,
  schema,
  seedDemoShowcaseData,
  type StoryKeeperDatabase,
} from '@story-keeper/database';
import { storyKeeperDemoIds } from '@story-keeper/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  startTestRuntime,
  type TestRuntime,
} from '../../../../../packages/mcp-server/test/runtime.js';

describe('conflict resolution through the real browser MCP client', () => {
  let directory: string;
  let runtime: TestRuntime;
  let client: StoryKeeperMcpClient;
  let database: StoryKeeperDatabase;
  let memory: DrizzleStoryMemoryRepository;
  let interviewId: string;
  let answerId: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'story-keeper-person-b-phase-5-'));
    runtime = await startTestRuntime(join(directory, 'conflicts.sqlite'));
    database = runtime.database;
    seedDemoShowcaseData(database);
    client = new StoryKeeperMcpClient(runtime.mcpUrl);
    await client.connect();
    const started = await client.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.rosaPersonId,
    });
    interviewId = started.interviewId;
    answerId = (
      await client.saveAnswer({
        familyId: storyKeeperDemoIds.familyId,
        interviewId,
        questionId: started.questionId,
        rawText: 'Rosa remembered both 1962 and 1964 while talking about the move.',
      })
    ).answerId;
    memory = new DrizzleStoryMemoryRepository(database);
  });

  afterEach(async () => {
    await client.disconnect();
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('keeps the first fact pending, preserves provenance, and handles replay and stale choices', async () => {
    const conflict = createFactConflict();
    const input: ResolveConflictInput = {
      familyId: storyKeeperDemoIds.familyId,
      interviewId,
      contradictionId: conflict.contradictionId,
      resolutionType: 'keep_left',
    };

    await expect(client.resolveConflict(input)).resolves.toMatchObject({
      status: 'resolved',
      resolutionType: 'keep_left',
    });
    expect(memory.findFact(storyKeeperDemoIds.familyId, conflict.leftId)?.status).toBe('pending');
    expect(memory.findFact(storyKeeperDemoIds.familyId, conflict.rightId)?.status).toBe('rejected');
    expect(memory.listFactSources(storyKeeperDemoIds.familyId, conflict.rightId)).toHaveLength(1);
    expect(
      database.client.prepare('SELECT raw_text FROM answers WHERE id = ?').get(answerId),
    ).toEqual({
      raw_text: 'Rosa remembered both 1962 and 1964 while talking about the move.',
    });
    await expect(
      client.listPendingConflicts({ familyId: storyKeeperDemoIds.familyId, interviewId }),
    ).resolves.toEqual({ conflicts: [] });
    await expect(client.resolveConflict(input)).resolves.toMatchObject({
      status: 'already_resolved',
      resolutionType: 'keep_left',
    });
    await expect(
      client.resolveConflict({ ...input, resolutionType: 'keep_right' }),
    ).rejects.toEqual(
      new StoryKeeperClientError('conflict_state', 'This conflict changed since it was loaded.'),
    );
  });

  it('keeps the second fact without approving it', async () => {
    const conflict = createFactConflict();
    await client.resolveConflict({
      familyId: storyKeeperDemoIds.familyId,
      interviewId,
      contradictionId: conflict.contradictionId,
      resolutionType: 'keep_right',
    });

    expect(memory.findFact(storyKeeperDemoIds.familyId, conflict.leftId)?.status).toBe('rejected');
    expect(memory.findFact(storyKeeperDemoIds.familyId, conflict.rightId)?.status).toBe('pending');
  });

  it('preserves both timeline events when they are different events', async () => {
    const conflict = createTimelineConflict();
    await expect(
      client.resolveConflict({
        familyId: storyKeeperDemoIds.familyId,
        interviewId,
        contradictionId: conflict.contradictionId,
        resolutionType: 'different_events',
      }),
    ).resolves.toMatchObject({ status: 'resolved', resolutionType: 'different_events' });

    expect(memory.findTimelineEvent(storyKeeperDemoIds.familyId, conflict.leftId)?.status).toBe(
      'pending',
    );
    expect(memory.findTimelineEvent(storyKeeperDemoIds.familyId, conflict.rightId)?.status).toBe(
      'pending',
    );
    await expect(
      client.listPendingConflicts({ familyId: storyKeeperDemoIds.familyId, interviewId }),
    ).resolves.toEqual({ conflicts: [] });
  });

  it('dismisses a non-conflict while preserving both pending claims', async () => {
    const conflict = createFactConflict();
    await expect(
      client.resolveConflict({
        familyId: storyKeeperDemoIds.familyId,
        interviewId,
        contradictionId: conflict.contradictionId,
        resolutionType: 'dismiss_not_a_conflict',
      }),
    ).resolves.toMatchObject({
      status: 'dismissed',
      resolutionType: 'dismiss_not_a_conflict',
    });

    expect(memory.findFact(storyKeeperDemoIds.familyId, conflict.leftId)?.status).toBe('pending');
    expect(memory.findFact(storyKeeperDemoIds.familyId, conflict.rightId)?.status).toBe('pending');
  });

  it('rejects a relative interview attempting to resolve Rosa’s conflict', async () => {
    const conflict = createFactConflict();
    const mayaInterview = await client.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.mayaPersonId,
    });

    await expect(
      client.resolveConflict({
        familyId: storyKeeperDemoIds.familyId,
        interviewId: mayaInterview.interviewId,
        contradictionId: conflict.contradictionId,
        resolutionType: 'keep_left',
      }),
    ).rejects.toMatchObject({ code: 'conflict_state' });
    expect(memory.findFact(storyKeeperDemoIds.familyId, conflict.leftId)?.status).toBe('pending');
    expect(memory.findFact(storyKeeperDemoIds.familyId, conflict.rightId)?.status).toBe('pending');
  });

  function createFactConflict() {
    const left = memory.createFactWithSource({
      familyId: storyKeeperDemoIds.familyId,
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1962',
      confidence: 0.9,
      answerId,
    }).fact;
    const right = memory.createFactWithSource({
      familyId: storyKeeperDemoIds.familyId,
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1964',
      confidence: 0.9,
      answerId,
    }).fact;
    const contradiction = memory.createContradiction({
      familyId: storyKeeperDemoIds.familyId,
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });
    return { contradictionId: contradiction.id, leftId: left.id, rightId: right.id };
  }

  function createTimelineConflict() {
    const left = memory.createTimelineEvent({
      familyId: storyKeeperDemoIds.familyId,
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      eventType: 'move',
      title: 'Moved to Delhi',
      description: 'First account.',
      date: { earliestYear: 1962, latestYear: 1962, precision: 'approximate' },
    });
    const right = memory.createTimelineEvent({
      familyId: storyKeeperDemoIds.familyId,
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      eventType: 'move',
      title: 'Moved to Delhi',
      description: 'Second account.',
      date: { earliestYear: 1964, latestYear: 1964, precision: 'exact' },
    });
    const job = new DrizzleJobRepository(database).listByFamily(storyKeeperDemoIds.familyId)[0];
    if (job === undefined) throw new Error('Expected the answer extraction job.');
    for (const event of [left, right]) {
      database.db
        .insert(schema.timelineEventSources)
        .values({
          id: randomUUID(),
          familyId: storyKeeperDemoIds.familyId,
          timelineEventId: event.id,
          answerId,
          jobId: job.id,
          createdAt: new Date(),
        })
        .run();
    }
    const contradiction = memory.createContradiction({
      familyId: storyKeeperDemoIds.familyId,
      type: 'timeline_date',
      leftTimelineEventId: left.id,
      rightTimelineEventId: right.id,
    });
    return { contradictionId: contradiction.id, leftId: left.id, rightId: right.id };
  }
});
