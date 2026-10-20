// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  demoShowcaseSeedIds,
  schema,
  seedDemoShowcaseData,
  type StoryKeeperDatabase,
} from '@story-keeper/database';
import { StoryKeeperMcpClient } from '@story-keeper/mcp-client';
import { storyKeeperDemoIds } from '@story-keeper/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  startTestRuntime,
  type TestRuntime,
} from '../../../../../packages/mcp-server/test/runtime.js';

describe('family search through the real browser MCP client', () => {
  let directory: string;
  let runtime: TestRuntime;
  let database: StoryKeeperDatabase;
  let client: StoryKeeperMcpClient;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'story-keeper-person-b-phase-9-'));
    runtime = await startTestRuntime(join(directory, 'search.sqlite'));
    database = runtime.database;
    seedDemoShowcaseData(database);
    seedApprovedSearchCorpus(database);
    client = new StoryKeeperMcpClient(runtime.mcpUrl);
    await client.connect();
  });

  afterEach(async () => {
    await client.disconnect();
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('returns the same approved corpus in stable backend order to narrator, relative, and child', async () => {
    const actors = [
      storyKeeperDemoIds.rosaPersonId,
      storyKeeperDemoIds.mayaPersonId,
      demoShowcaseSeedIds.arunPersonId,
    ];
    const responses = await Promise.all(
      actors.map((actorPersonId) =>
        client.searchFamilyStory({
          familyId: storyKeeperDemoIds.familyId,
          actorPersonId,
          query: 'saffron',
          limit: 25,
        }),
      ),
    );
    expect(responses[0]?.results.map(({ sourceType }) => sourceType).sort()).toEqual([
      'chapter',
      'fact',
      'relationship',
      'timeline_event',
    ]);
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[2]).toEqual(responses[0]);
    await expect(
      client.searchFamilyStory({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
        query: 'saffron',
        limit: 25,
      }),
    ).resolves.toEqual(responses[0]);
  });

  it('excludes pending, rejected, private chapter, raw answer, and queued-question text', async () => {
    const started = await client.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.rosaPersonId,
    });
    await client.saveAnswer({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: started.interviewId,
      questionId: started.questionId,
      rawText: 'rawanswerneedle',
    });
    await client.queueFamilyQuestion({
      familyId: storyKeeperDemoIds.familyId,
      fromPersonId: storyKeeperDemoIds.mayaPersonId,
      toPersonId: storyKeeperDemoIds.rosaPersonId,
      questionText: 'questionneedle?',
    });

    for (const query of [
      'pendingneedle',
      'rejectedneedle',
      'draftneedle',
      'failedneedle',
      'rawanswerneedle',
      'questionneedle',
    ]) {
      await expect(search(query)).resolves.toEqual({ results: [] });
    }
  });

  it('rejects inactive and cross-family actors without exposing backend details', async () => {
    database.client
      .prepare("UPDATE family_memberships SET status = 'inactive' WHERE person_id = ?")
      .run(demoShowcaseSeedIds.arunPersonId);
    await expect(
      client.searchFamilyStory({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: demoShowcaseSeedIds.arunPersonId,
        query: 'saffron',
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: 'authorization' });

    const other = seedOtherFamily(database);
    await expect(
      client.searchFamilyStory({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: other.actorId,
        query: 'saffron',
        limit: 10,
      }),
    ).rejects.toMatchObject({
      code: 'authorization',
      message: 'This family member is not authorized for that information.',
    });
  });

  it('revalidates rejected, cross-family, and unresolved-identity stale FTS rows', async () => {
    const rejectedId = insertFact(
      database,
      storyKeeperDemoIds.familyId,
      'rejectedstale',
      'rejected',
    );
    injectSearchRow(database, storyKeeperDemoIds.familyId, 'fact', rejectedId, 'rejectedstale');

    const other = seedOtherFamily(database);
    const otherFactId = insertFact(
      database,
      other.familyId,
      'crossfamilystale',
      'approved',
      other.actorId,
    );
    injectSearchRow(database, storyKeeperDemoIds.familyId, 'fact', otherFactId, 'crossfamilystale');

    const candidateId = randomUUID();
    const relationshipId = randomUUID();
    const now = Date.now();
    database.client
      .prepare(
        `INSERT INTO people
        (id, family_id, canonical_display_name, status, created_at, updated_at)
        VALUES (?, ?, 'Unresolved Saffron Person', 'active', ?, ?)`,
      )
      .run(candidateId, storyKeeperDemoIds.familyId, now, now);
    database.client
      .prepare(
        `INSERT INTO relationships
        (id, family_id, from_person_id, to_person_id, relationship_type, confidence, approval_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'sibling', 1, 'approved', ?, ?)`,
      )
      .run(
        relationshipId,
        storyKeeperDemoIds.familyId,
        storyKeeperDemoIds.rosaPersonId,
        candidateId,
        now,
        now,
      );
    const started = await client.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.rosaPersonId,
    });
    const { answerId } = await client.saveAnswer({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: started.interviewId,
      questionId: started.questionId,
      rawText: 'A source for an unresolved identity candidate.',
    });
    const job = database.client
      .prepare(
        "SELECT id FROM jobs WHERE family_id = ? AND type = 'extract_answer' ORDER BY created_at DESC LIMIT 1",
      )
      .get(storyKeeperDemoIds.familyId) as { readonly id: string } | undefined;
    if (job === undefined) throw new Error('Expected an extraction job.');
    database.db
      .insert(schema.personCandidates)
      .values({
        id: randomUUID(),
        familyId: storyKeeperDemoIds.familyId,
        candidatePersonId: candidateId,
        answerId,
        jobId: job.id,
        extractedName: 'Unresolved Saffron Person',
        confidence: 1,
        status: 'unresolved',
        possibleMatchPersonId: null,
        matchScore: null,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .run();
    injectSearchRow(
      database,
      storyKeeperDemoIds.familyId,
      'relationship',
      relationshipId,
      'unresolvedidentitystale',
    );

    for (const query of ['rejectedstale', 'crossfamilystale', 'unresolvedidentitystale']) {
      await expect(search(query)).resolves.toEqual({ results: [] });
    }
  });

  it.each([
    ['quotes', '"saffron"'],
    ['parentheses and operators', '(saffron OR orchard) NEAR'],
    ['apostrophe', 'Élodie’s café'],
    ['Unicode', 'Élodie café'],
  ])('handles supported odd input: %s', async (_label, query) => {
    expect(Array.isArray((await search(query)).results)).toBe(true);
  });

  it.each(['   ', '*', '" * ( )', 'x'.repeat(201)])(
    'rejects invalid input safely: %s',
    async (query) => {
      await expect(search(query)).rejects.toMatchObject({ code: 'validation' });
    },
  );

  function search(query: string) {
    return client.searchFamilyStory({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      query,
      limit: 10,
    });
  }
});

function seedApprovedSearchCorpus(database: StoryKeeperDatabase): void {
  insertFact(database, storyKeeperDemoIds.familyId, 'saffron Élodie café', 'approved');
  insertFact(database, storyKeeperDemoIds.familyId, 'pendingneedle', 'pending');
  insertFact(database, storyKeeperDemoIds.familyId, 'rejectedneedle', 'rejected');
  const now = Date.now();
  const saffronPersonId = randomUUID();
  database.client
    .prepare(
      `INSERT INTO people
      (id, family_id, canonical_display_name, status, created_at, updated_at)
      VALUES (?, ?, 'Saffron Cousin', 'active', ?, ?)`,
    )
    .run(saffronPersonId, storyKeeperDemoIds.familyId, now, now);
  database.client
    .prepare(
      `INSERT INTO relationships
      (id, family_id, from_person_id, to_person_id, relationship_type, confidence, approval_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'cousin', 1, 'approved', ?, ?)`,
    )
    .run(
      randomUUID(),
      storyKeeperDemoIds.familyId,
      storyKeeperDemoIds.rosaPersonId,
      saffronPersonId,
      now,
      now,
    );
  database.client
    .prepare(
      `INSERT INTO timeline_events
      (id, family_id, subject_person_id, event_type, title, description, earliest_year, latest_year, date_precision, approval_status, created_at, updated_at)
      VALUES (?, ?, ?, 'festival', 'Saffron festival', 'A saffron family gathering.', 1972, 1972, 'approximate', 'approved', ?, ?)`,
    )
    .run(randomUUID(), storyKeeperDemoIds.familyId, storyKeeperDemoIds.rosaPersonId, now, now);
  for (const [status, body] of [
    ['approved', 'A saffron chapter.'],
    ['pending_review', 'draftneedle'],
    ['failed', 'failedneedle'],
  ] as const) {
    const jobId = randomUUID();
    const chapterId = randomUUID();
    database.client
      .prepare(
        `INSERT INTO jobs
        (id, family_id, type, payload, deduplication_key, status, attempt_count, max_attempts, available_at, completed_at, created_at, updated_at)
        VALUES (?, ?, 'draft_chapter', '{}', ?, 'succeeded', 1, 3, ?, ?, ?, ?)`,
      )
      .run(jobId, storyKeeperDemoIds.familyId, `chapter:${chapterId}`, now, now, now, now);
    database.client
      .prepare(
        `INSERT INTO chapter_drafts
        (id, family_id, narrator_person_id, requested_topic, title, body, status, generation_job_id, reviewed_by_person_id, reviewed_at, created_at, updated_at)
        VALUES (?, ?, ?, 'family', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        chapterId,
        storyKeeperDemoIds.familyId,
        storyKeeperDemoIds.rosaPersonId,
        status === 'failed' ? null : 'Saffron chapter',
        status === 'failed' ? null : body,
        status,
        jobId,
        status === 'approved' ? storyKeeperDemoIds.rosaPersonId : null,
        status === 'approved' ? now : null,
        now,
        now,
      );
  }
}

function insertFact(
  database: StoryKeeperDatabase,
  familyId: string,
  value: string,
  status: 'pending' | 'approved' | 'rejected',
  subjectPersonId: string = storyKeeperDemoIds.rosaPersonId,
): string {
  const id = randomUUID();
  const now = Date.now();
  database.client
    .prepare(
      `INSERT INTO facts
      (id, family_id, subject_person_id, fact_type, normalized_value, confidence, approval_status, created_at, updated_at)
      VALUES (?, ?, ?, 'family_memory', ?, 1, ?, ?, ?)`,
    )
    .run(id, familyId, subjectPersonId, value, status, now, now);
  return id;
}

function injectSearchRow(
  database: StoryKeeperDatabase,
  familyId: string,
  sourceType: 'fact' | 'relationship',
  sourceId: string,
  body: string,
): void {
  database.client
    .prepare(
      `INSERT INTO story_search
      (family_id, source_type, source_id, person_id, person_display_name, title, body)
      VALUES (?, ?, ?, ?, 'Rosa', 'stale row', ?)`,
    )
    .run(familyId, sourceType, sourceId, storyKeeperDemoIds.rosaPersonId, body);
}

function seedOtherFamily(database: StoryKeeperDatabase): { familyId: string; actorId: string } {
  const familyId = randomUUID();
  const actorId = randomUUID();
  const now = Date.now();
  database.client
    .prepare('INSERT INTO families (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(familyId, 'Other family', now, now);
  database.client
    .prepare(
      `INSERT INTO people
      (id, family_id, canonical_display_name, status, created_at, updated_at)
      VALUES (?, ?, 'Other narrator', 'active', ?, ?)`,
    )
    .run(actorId, familyId, now, now);
  database.client
    .prepare(
      `INSERT INTO family_memberships
      (id, family_id, person_id, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'narrator', 'active', ?, ?)`,
    )
    .run(randomUUID(), familyId, actorId, now, now);
  return { familyId, actorId };
}
