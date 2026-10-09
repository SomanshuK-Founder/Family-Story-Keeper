import { randomUUID } from 'node:crypto';

import {
  createDatabase,
  DrizzlePrivacyRepository,
  runMigrations,
  seedDemoData,
  SqliteSearchRepository,
  type StoryKeeperDatabase,
} from '@story-keeper/database';
import { demoSeedIds } from '@story-keeper/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StoryKeeperError } from '../src/errors.js';
import { normalizeSearchQuery, SearchService } from '../src/search-service.js';

describe('approved family story search', () => {
  let database: StoryKeeperDatabase;
  let repository: SqliteSearchRepository;
  let service: SearchService;

  beforeEach(() => {
    database = createDatabase(':memory:');
    runMigrations(database);
    seedDemoData(database);
    repository = new SqliteSearchRepository(database);
    service = new SearchService(new DrizzlePrivacyRepository(database), repository);
  });

  afterEach(() => {
    database.close();
  });

  it('synchronizes pending, approved, and revoked facts without exposing raw answers', () => {
    const factId = insertFact(database, demoSeedIds.familyId, demoSeedIds.rosaPersonId, 'pending');

    database.client
      .prepare(
        `INSERT INTO story_search
        (family_id, source_type, source_id, person_id, person_display_name, title, body)
        VALUES (?, 'fact', ?, ?, 'Rosa', 'stale', 'silver box')`,
      )
      .run(demoSeedIds.familyId, factId, demoSeedIds.rosaPersonId);
    expect(search(service, 'silver box')).toEqual([]);
    database.client
      .prepare("UPDATE facts SET approval_status = 'approved' WHERE id = ?")
      .run(factId);
    const approved = search(service, 'silver box');
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({ sourceType: 'fact', sourceId: factId });
    expect(JSON.stringify(approved)).not.toContain('answer');

    database.client
      .prepare("UPDATE facts SET approval_status = 'rejected' WHERE id = ?")
      .run(factId);
    expect(search(service, 'silver box')).toEqual([]);
  });

  it('indexes eligible relationships, approximate timeline events, and approved chapters only', () => {
    const mayaId = addMember(database, demoSeedIds.familyId, 'Maya', 'relative');
    const relationshipId = randomUUID();
    const timelineId = randomUUID();
    const now = Date.now();
    database.client
      .prepare(
        `INSERT INTO relationships
        (id, family_id, from_person_id, to_person_id, relationship_type, confidence, approval_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'sibling', 1, 'pending', ?, ?)`,
      )
      .run(relationshipId, demoSeedIds.familyId, demoSeedIds.rosaPersonId, mayaId, now, now);
    database.client
      .prepare(
        `INSERT INTO timeline_events
        (id, family_id, subject_person_id, event_type, title, description, earliest_year, latest_year, date_precision, approval_status, created_at, updated_at)
        VALUES (?, ?, ?, 'move', 'Moved to Delhi', 'The family settled near the market.', 1962, 1964, 'approximate', 'pending', ?, ?)`,
      )
      .run(timelineId, demoSeedIds.familyId, demoSeedIds.rosaPersonId, now, now);
    const chapterId = insertChapter(database, 'pending_review', 'The orchard years');

    expect(search(service, 'sibling Maya')).toEqual([]);
    expect(search(service, 'Delhi')).toEqual([]);
    expect(search(service, 'orchard')).toEqual([]);
    database.client
      .prepare("UPDATE relationships SET approval_status = 'approved' WHERE id = ?")
      .run(relationshipId);
    database.client
      .prepare("UPDATE timeline_events SET approval_status = 'approved' WHERE id = ?")
      .run(timelineId);
    database.client
      .prepare(
        "UPDATE chapter_drafts SET status = 'approved', reviewed_by_person_id = ?, reviewed_at = ? WHERE id = ?",
      )
      .run(demoSeedIds.rosaPersonId, now, chapterId);

    expect(search(service, 'sibling Maya')[0]).toMatchObject({
      sourceType: 'relationship',
      sourceId: relationshipId,
    });
    expect(search(service, 'Delhi')[0]).toMatchObject({
      sourceType: 'timeline_event',
      sourceId: timelineId,
      date: { earliestYear: 1962, latestYear: 1964, precision: 'approximate' },
    });
    expect(search(service, 'orchard')[0]).toMatchObject({
      sourceType: 'chapter',
      sourceId: chapterId,
    });

    database.client
      .prepare("UPDATE relationships SET approval_status = 'rejected' WHERE id = ?")
      .run(relationshipId);
    database.client
      .prepare("UPDATE timeline_events SET approval_status = 'rejected' WHERE id = ?")
      .run(timelineId);
    database.client
      .prepare("UPDATE chapter_drafts SET status = 'rejected' WHERE id = ?")
      .run(chapterId);
    expect(search(service, 'sibling Maya')).toEqual([]);
    expect(search(service, 'Delhi')).toEqual([]);
    expect(search(service, 'orchard')).toEqual([]);
  });

  it('excludes claims participating in unresolved contradictions', () => {
    const leftId = insertFact(
      database,
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'approved',
      '1962',
    );
    const rightId = insertFact(
      database,
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'approved',
      '1964',
    );
    expect(search(service, 'birth year')).toHaveLength(2);
    const now = Date.now();
    database.client
      .prepare(
        `INSERT INTO contradictions
      (id, family_id, contradiction_type, left_fact_id, right_fact_id, status, created_at, updated_at)
      VALUES (?, ?, 'fact_value', ?, ?, 'unresolved', ?, ?)`,
      )
      .run(randomUUID(), demoSeedIds.familyId, leftId, rightId, now, now);
    expect(search(service, 'birth year')).toEqual([]);
  });

  it('enforces active family membership and family scope', () => {
    const otherFamilyId = randomUUID();
    const otherActorId = randomUUID();
    const now = Date.now();
    database.client
      .prepare(
        'INSERT INTO families (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      )
      .run(otherFamilyId, 'Other', now, now);
    addMember(database, otherFamilyId, 'Other narrator', 'narrator', otherActorId);
    insertFact(database, otherFamilyId, otherActorId, 'approved', 'orchard secret');

    expect(search(service, 'orchard', otherFamilyId, otherActorId)).toHaveLength(1);
    expect(() => search(service, 'orchard', demoSeedIds.familyId, otherActorId)).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'ACTOR_NOT_AUTHORIZED' }),
    );
    expect(search(service, 'orchard')).toEqual([]);
  });

  it('normalizes natural-language and reserved-looking input without exposing MATCH syntax', () => {
    expect(normalizeSearchQuery('  Farm in Punjab! ')).toBe('"Farm" AND "in" AND "Punjab"');
    expect(normalizeSearchQuery('“Raj” OR * NEAR( orchard )')).toBe(
      '"Raj" AND "OR" AND "NEAR" AND "orchard"',
    );
    expect(normalizeSearchQuery('Élodie’s café')).toBe('"Élodie" AND "s" AND "café"');
    expect(() => normalizeSearchQuery('" * ( )')).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'SEARCH_QUERY_INVALID' }),
    );
  });

  it('uses stable ranking and rebuilds the derived index idempotently', () => {
    const repeatedId = insertFact(
      database,
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'approved',
      'orchard orchard orchard',
    );
    insertFact(database, demoSeedIds.familyId, demoSeedIds.rosaPersonId, 'approved', 'orchard');
    const first = search(service, 'orchard');
    const second = search(service, 'orchard');
    expect(first).toEqual(second);
    expect(first[0]?.sourceId).toBe(repeatedId);

    const count = repository.count();
    expect(repository.rebuild()).toBe(count);
    expect(repository.rebuild()).toBe(count);
    expect(search(service, 'orchard')).toEqual(first);
  });
});

function search(
  service: SearchService,
  query: string,
  familyId: string = demoSeedIds.familyId,
  actorPersonId: string = demoSeedIds.rosaPersonId,
) {
  return service.searchFamilyStory(familyId, actorPersonId, query, 10).results;
}

function insertFact(
  database: StoryKeeperDatabase,
  familyId: string,
  subjectPersonId: string,
  status: 'pending' | 'approved' | 'rejected',
  value = 'Rosa buried the silver box beside the mango tree.',
): string {
  const id = randomUUID();
  const now = Date.now();
  database.client
    .prepare(
      `INSERT INTO facts
    (id, family_id, subject_person_id, fact_type, normalized_value, confidence, approval_status, created_at, updated_at)
    VALUES (?, ?, ?, 'birth_year', ?, 1, ?, ?, ?)`,
    )
    .run(id, familyId, subjectPersonId, value, status, now, now);
  return id;
}

function addMember(
  database: StoryKeeperDatabase,
  familyId: string,
  name: string,
  role: 'narrator' | 'relative' | 'child',
  id = randomUUID(),
): string {
  const now = Date.now();
  database.client
    .prepare(
      `INSERT INTO people
    (id, family_id, canonical_display_name, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)`,
    )
    .run(id, familyId, name, now, now);
  database.client
    .prepare(
      `INSERT INTO family_memberships
    (id, family_id, person_id, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(randomUUID(), familyId, id, role, now, now);
  return id;
}

function insertChapter(
  database: StoryKeeperDatabase,
  status: 'approved' | 'pending_review',
  body: string,
): string {
  const id = randomUUID();
  const jobId = randomUUID();
  const now = Date.now();
  database.client
    .prepare(
      `INSERT INTO jobs
    (id, family_id, type, payload, deduplication_key, status, attempt_count, max_attempts, available_at, completed_at, created_at, updated_at)
    VALUES (?, ?, 'draft_chapter', '{}', ?, 'succeeded', 1, 3, ?, ?, ?, ?)`,
    )
    .run(jobId, demoSeedIds.familyId, `chapter:${id}`, now, now, now, now);
  database.client
    .prepare(
      `INSERT INTO chapter_drafts
    (id, family_id, narrator_person_id, requested_topic, title, body, status, generation_job_id, reviewed_by_person_id, reviewed_at, created_at, updated_at)
    VALUES (?, ?, ?, 'family', 'Family chapter', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      body,
      status,
      jobId,
      status === 'approved' ? demoSeedIds.rosaPersonId : null,
      status === 'approved' ? now : null,
      now,
      now,
    );
  return id;
}
