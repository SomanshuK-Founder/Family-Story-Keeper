// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StoryKeeperClientError, StoryKeeperMcpClient } from '@story-keeper/mcp-client';
import {
  DrizzleFamilyQuestionRepository,
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

describe('family questions through the real browser MCP client', () => {
  let directory: string;
  let runtime: TestRuntime;
  let database: StoryKeeperDatabase;
  let client: StoryKeeperMcpClient;
  let questions: DrizzleFamilyQuestionRepository;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'story-keeper-person-b-phase-7-'));
    runtime = await startTestRuntime(join(directory, 'family-questions.sqlite'));
    database = runtime.database;
    seedDemoShowcaseData(database);
    questions = new DrizzleFamilyQuestionRepository(database);
    client = new StoryKeeperMcpClient(runtime.mcpUrl);
    await client.connect();
  });

  afterEach(async () => {
    await client.disconnect();
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('queues durably, preserves the current question, surfaces once, and answers atomically', async () => {
    const started = await client.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.rosaPersonId,
    });
    const queued = await client.queueFamilyQuestion({
      familyId: storyKeeperDemoIds.familyId,
      fromPersonId: storyKeeperDemoIds.mayaPersonId,
      toPersonId: storyKeeperDemoIds.rosaPersonId,
      questionText: '  What was your first job?  ',
    });

    expect(queued.status).toBe('queued');
    expect(
      questions.findQuestion(storyKeeperDemoIds.familyId, queued.queuedQuestionId),
    ).toMatchObject({
      questionText: 'What was your first job?',
      fromDisplayName: 'Maya',
      status: 'queued',
    });
    await expect(
      client.getNextQuestion({
        familyId: storyKeeperDemoIds.familyId,
        interviewId: started.interviewId,
      }),
    ).resolves.toMatchObject({ questionId: started.questionId });

    await client.saveAnswer({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: started.interviewId,
      questionId: started.questionId,
      rawText: 'I grew up near the old market.',
    });
    const surfaced = await client.getNextQuestion({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: started.interviewId,
    });
    expect(surfaced).toMatchObject({
      status: 'question',
      questionText: 'Maya left you a question. They asked: “What was your first job?”',
    });
    await expect(
      client.getNextQuestion({
        familyId: storyKeeperDemoIds.familyId,
        interviewId: started.interviewId,
      }),
    ).resolves.toEqual(surfaced);
    expect(
      questions.findQuestion(storyKeeperDemoIds.familyId, queued.queuedQuestionId)?.status,
    ).toBe('asked');
    expect(
      database.client
        .prepare('SELECT count(*) AS count FROM questions WHERE source_reference_id = ?')
        .get(`family_queue:${queued.queuedQuestionId}`),
    ).toEqual({ count: 1 });

    if (surfaced.status !== 'question') throw new Error('Expected a queued family question.');
    const saved = await client.saveAnswer({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: surfaced.interviewId,
      questionId: surfaced.questionId,
      rawText: 'My first job was helping at the railway office.',
    });
    expect(
      questions.findQuestion(storyKeeperDemoIds.familyId, queued.queuedQuestionId)?.status,
    ).toBe('answered');
    expect(
      database.client.prepare('SELECT raw_text FROM answers WHERE id = ?').get(saved.answerId),
    ).toEqual({ raw_text: 'My first job was helping at the railway office.' });
    expect(
      database.client
        .prepare("SELECT count(*) AS count FROM jobs WHERE payload = ? AND status = 'queued'")
        .get(JSON.stringify({ answerId: saved.answerId })),
    ).toEqual({ count: 1 });
  });

  it('allows intentional repeated questions but rejects prohibited senders and targets safely', async () => {
    const input = {
      familyId: storyKeeperDemoIds.familyId,
      fromPersonId: storyKeeperDemoIds.mayaPersonId,
      toPersonId: storyKeeperDemoIds.rosaPersonId,
      questionText: 'Tell me about the old house.',
    };
    const first = await client.queueFamilyQuestion(input);
    const second = await client.queueFamilyQuestion(input);
    expect(second.queuedQuestionId).not.toBe(first.queuedQuestionId);

    const inactiveRelativeId = addMember('Inactive Relative', 'relative', 'inactive');
    const inactiveNarratorId = addMember('Inactive Narrator', 'narrator', 'inactive');
    const unknownPersonId = randomUUID();
    const otherFamily = addOtherFamily();
    const attempts = [
      { ...input, fromPersonId: storyKeeperDemoIds.rosaPersonId },
      { ...input, fromPersonId: inactiveRelativeId },
      { ...input, fromPersonId: unknownPersonId },
      { ...input, toPersonId: inactiveNarratorId },
      { ...input, fromPersonId: otherFamily.relativeId },
      { ...input, toPersonId: otherFamily.narratorId },
    ];
    for (const attempt of attempts) {
      await expect(client.queueFamilyQuestion(attempt)).rejects.toEqual(
        new StoryKeeperClientError(
          'authorization',
          'This family question cannot be sent for that person.',
        ),
      );
    }
  });

  function addMember(
    displayName: string,
    role: 'narrator' | 'relative' | 'child',
    status: 'active' | 'inactive',
  ): string {
    const personId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.people)
      .values({
        id: personId,
        familyId: storyKeeperDemoIds.familyId,
        canonicalDisplayName: displayName,
        status,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(schema.familyMemberships)
      .values({
        id: randomUUID(),
        familyId: storyKeeperDemoIds.familyId,
        personId,
        role,
        status,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return personId;
  }

  function addOtherFamily(): { readonly narratorId: string; readonly relativeId: string } {
    const familyId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.families)
      .values({
        id: familyId,
        displayName: 'Another Family',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const narratorId = randomUUID();
    const relativeId = randomUUID();
    for (const member of [
      { personId: narratorId, displayName: 'Other Narrator', role: 'narrator' as const },
      { personId: relativeId, displayName: 'Other Relative', role: 'relative' as const },
    ]) {
      database.db
        .insert(schema.people)
        .values({
          id: member.personId,
          familyId,
          canonicalDisplayName: member.displayName,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      database.db
        .insert(schema.familyMemberships)
        .values({
          id: randomUUID(),
          familyId,
          personId: member.personId,
          role: member.role,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    return { narratorId, relativeId };
  }
});
