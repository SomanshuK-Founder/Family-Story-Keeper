// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StoryKeeperClientError, StoryKeeperMcpClient } from '@story-keeper/mcp-client';
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

describe('approval and privacy through the real browser MCP client', () => {
  let directory: string;
  let runtime: TestRuntime;
  let client: StoryKeeperMcpClient;
  let database: StoryKeeperDatabase;
  let memory: DrizzleStoryMemoryRepository;
  let answerId: string;
  let jobId: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'story-keeper-person-b-phase-6-'));
    runtime = await startTestRuntime(join(directory, 'approval.sqlite'));
    database = runtime.database;
    seedDemoShowcaseData(database);
    client = new StoryKeeperMcpClient(runtime.mcpUrl);
    await client.connect();
    const started = await client.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.rosaPersonId,
    });
    answerId = (
      await client.saveAnswer({
        familyId: storyKeeperDemoIds.familyId,
        interviewId: started.interviewId,
        questionId: started.questionId,
        rawText: 'Rosa remembered a source-backed family detail.',
      })
    ).answerId;
    memory = new DrizzleStoryMemoryRepository(database);
    const job = new DrizzleJobRepository(database).listByFamily(storyKeeperDemoIds.familyId)[0];
    if (job === undefined) throw new Error('Expected a source extraction job.');
    jobId = job.id;
  });

  afterEach(async () => {
    await client.disconnect();
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('approves a sourced fact idempotently and protects it from a stale reject', async () => {
    const fact = createFact('home_city', 'Delhi');
    const input = {
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'fact' as const,
      targetId: fact.id,
      action: 'approve' as const,
    };

    await expect(client.approveStoryItem(input)).resolves.toMatchObject({
      status: 'updated',
      itemStatus: 'approved',
    });
    await expect(client.approveStoryItem(input)).resolves.toMatchObject({
      status: 'already_applied',
      itemStatus: 'approved',
    });
    expect(memory.findFact(storyKeeperDemoIds.familyId, fact.id)?.status).toBe('approved');
    expect(memory.listFactSources(storyKeeperDemoIds.familyId, fact.id)).toHaveLength(1);
    expect(
      database.client.prepare('SELECT raw_text FROM answers WHERE id = ?').get(answerId),
    ).toEqual({ raw_text: 'Rosa remembered a source-backed family detail.' });
    expect(
      (
        await client.getStoryContext({
          familyId: storyKeeperDemoIds.familyId,
          actorPersonId: storyKeeperDemoIds.mayaPersonId,
        })
      ).facts.map(({ id }) => id),
    ).toContain(fact.id);
    expect(
      database.client
        .prepare('SELECT count(*) AS count FROM approvals WHERE target_id = ?')
        .get(fact.id),
    ).toEqual({ count: 1 });

    await expect(client.approveStoryItem({ ...input, action: 'reject' })).rejects.toEqual(
      new StoryKeeperClientError('story_item_state', 'This memory changed since it was loaded.'),
    );
    expect(memory.findFact(storyKeeperDemoIds.familyId, fact.id)?.status).toBe('approved');
  });

  it('rejects pending memory and revokes approved memory without losing provenance', async () => {
    const rejected = createFact('favorite_color', 'blue');
    const rejectInput = {
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'fact' as const,
      targetId: rejected.id,
      action: 'reject' as const,
    };
    await expect(client.approveStoryItem(rejectInput)).resolves.toMatchObject({
      status: 'updated',
      itemStatus: 'rejected',
    });
    await expect(client.approveStoryItem(rejectInput)).resolves.toMatchObject({
      status: 'already_applied',
      itemStatus: 'rejected',
    });
    expect(memory.findFact(storyKeeperDemoIds.familyId, rejected.id)?.status).toBe('rejected');
    expect(memory.listFactSources(storyKeeperDemoIds.familyId, rejected.id)).toHaveLength(1);
    expect(
      database.client
        .prepare('SELECT count(*) AS count FROM approvals WHERE target_id = ?')
        .get(rejected.id),
    ).toEqual({ count: 1 });

    const revoked = createFact('childhood_home', 'Old Delhi');
    await client.approveStoryItem({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'fact',
      targetId: revoked.id,
      action: 'approve',
    });
    const revokeInput = {
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'fact' as const,
      targetId: revoked.id,
      action: 'revoke' as const,
    };
    await expect(client.approveStoryItem(revokeInput)).resolves.toMatchObject({
      status: 'updated',
      itemStatus: 'rejected',
    });
    await expect(client.approveStoryItem(revokeInput)).resolves.toMatchObject({
      status: 'already_applied',
      itemStatus: 'rejected',
    });
    expect(memory.findFact(storyKeeperDemoIds.familyId, revoked.id)?.status).toBe('rejected');
    expect(memory.listFactSources(storyKeeperDemoIds.familyId, revoked.id)).toHaveLength(1);
    expect(
      database.client
        .prepare('SELECT count(*) AS count FROM approvals WHERE target_id = ?')
        .get(revoked.id),
    ).toEqual({ count: 2 });
    const maya = await client.getStoryContext({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.mayaPersonId,
    });
    expect(maya.facts.map(({ id }) => id)).not.toContain(rejected.id);
    expect(maya.facts.map(({ id }) => id)).not.toContain(revoked.id);
  });

  it('removes pending memory idempotently, preserves evidence, and deactivates its conflict', async () => {
    const left = createFact('move_year', '1962');
    const right = createFact('move_year', '1964');
    memory.createContradiction({
      familyId: storyKeeperDemoIds.familyId,
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });
    const input = {
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'fact' as const,
      targetId: left.id,
    };

    await expect(client.deletePendingMemory(input)).resolves.toMatchObject({ status: 'deleted' });
    await expect(client.deletePendingMemory(input)).resolves.toMatchObject({
      status: 'already_deleted',
    });
    expect(memory.findFact(storyKeeperDemoIds.familyId, left.id)?.status).toBe('rejected');
    expect(memory.listFactSources(storyKeeperDemoIds.familyId, left.id)).toHaveLength(1);
    const rosa = await client.getStoryContext({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
    });
    expect(rosa.facts.map(({ id }) => id)).not.toContain(left.id);
    expect(rosa.conflicts).toEqual([]);
    expect(
      database.client.prepare('SELECT raw_text FROM answers WHERE id = ?').get(answerId),
    ).toEqual({ raw_text: 'Rosa remembered a source-backed family detail.' });
  });

  it('rejects deletion of approved memory and relative mutation attempts', async () => {
    const fact = createFact('home_city', 'Delhi');
    await client.approveStoryItem({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'fact',
      targetId: fact.id,
      action: 'approve',
    });

    await expect(
      client.deletePendingMemory({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
        targetType: 'fact',
        targetId: fact.id,
      }),
    ).rejects.toMatchObject({ code: 'story_item_state' });
    await expect(
      client.approveStoryItem({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.mayaPersonId,
        targetType: 'fact',
        targetId: fact.id,
        action: 'revoke',
      }),
    ).rejects.toMatchObject({ code: 'authorization' });
    expect(memory.findFact(storyKeeperDemoIds.familyId, fact.id)?.status).toBe('approved');
  });

  it('does not approve a relationship with an unresolved person candidate', async () => {
    const candidatePersonId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.people)
      .values({
        id: candidatePersonId,
        familyId: storyKeeperDemoIds.familyId,
        canonicalDisplayName: 'Raj',
        status: 'inactive',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(schema.personCandidates)
      .values({
        id: randomUUID(),
        familyId: storyKeeperDemoIds.familyId,
        candidatePersonId,
        answerId,
        jobId,
        extractedName: 'Raj',
        confidence: 1,
        status: 'unresolved',
        possibleMatchPersonId: null,
        matchScore: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const relationship = memory.createRelationship({
      familyId: storyKeeperDemoIds.familyId,
      fromPersonId: storyKeeperDemoIds.rosaPersonId,
      toPersonId: candidatePersonId,
      relationshipType: 'sibling',
      confidence: 0.9,
    });
    database.db
      .insert(schema.relationshipSources)
      .values({
        id: randomUUID(),
        familyId: storyKeeperDemoIds.familyId,
        relationshipId: relationship.id,
        answerId,
        jobId,
        createdAt: now,
      })
      .run();

    await expect(
      client.approveStoryItem({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
        targetType: 'relationship',
        targetId: relationship.id,
        action: 'approve',
      }),
    ).rejects.toEqual(
      new StoryKeeperClientError(
        'identity',
        'This relationship cannot be approved until its person references are resolved.',
      ),
    );
    expect(memory.findRelationship(storyKeeperDemoIds.familyId, relationship.id)?.status).toBe(
      'pending',
    );
  });

  function createFact(factType: string, normalizedValue: string) {
    return memory.createFactWithSource({
      familyId: storyKeeperDemoIds.familyId,
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      factType,
      normalizedValue,
      confidence: 0.9,
      answerId,
    }).fact;
  }
});
