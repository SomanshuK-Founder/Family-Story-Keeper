import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDatabase, type StoryKeeperDatabase } from '../src/database.js';
import { DrizzleInterviewRepository } from '../src/interview-repository.js';
import { runMigrations } from '../src/migrations.js';
import { families, familyMemberships, people } from '../src/schema.js';
import { demoSeedIds, seedDemoData } from '../src/seed.js';
import {
  DrizzleStoryMemoryRepository,
  type StoryMemoryRepositoryError,
} from '../src/story-memory-repository.js';

describe('DrizzleStoryMemoryRepository', () => {
  let database: StoryKeeperDatabase;
  let repository: DrizzleStoryMemoryRepository;
  let answerId: string;
  let rajPersonId: string;

  beforeEach(() => {
    database = createDatabase(':memory:');
    runMigrations(database);
    seedDemoData(database);
    rajPersonId = addPerson(database, demoSeedIds.familyId, 'Raj');
    answerId = createAnswer(database);
    repository = new DrizzleStoryMemoryRepository(database);
  });

  afterEach(() => {
    database.close();
  });

  it('creates a pending fact and real answer provenance atomically', () => {
    const created = repository.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'childhood_home',
      normalizedValue: 'Pune',
      confidence: 0.9,
      answerId,
      sourceLocator: 'sentence:1',
    });

    expect(created.fact).toMatchObject({ status: 'pending', normalizedValue: 'Pune' });
    expect(created.source).toMatchObject({
      factId: created.fact.id,
      answerId,
      sourceLocator: 'sentence:1',
    });
    expect(repository.findFact(demoSeedIds.familyId, created.fact.id)).toEqual(created.fact);
    expect(repository.listFacts(demoSeedIds.familyId)).toEqual([created.fact]);
    expect(repository.listFactSources(demoSeedIds.familyId, created.fact.id)).toEqual([
      created.source,
    ]);
    expect(repository.findFact(randomUUID(), created.fact.id)).toBeUndefined();
  });

  it('rejects cross-family provenance without leaving a fact behind', () => {
    const otherFamilyId = addFamily(database, 'Other Family');
    const otherPersonId = addPerson(database, otherFamilyId, 'Other Narrator');

    expect(() =>
      repository.createFactWithSource({
        familyId: otherFamilyId,
        subjectPersonId: otherPersonId,
        factType: 'childhood_home',
        normalizedValue: 'Delhi',
        confidence: 0.8,
        answerId,
      }),
    ).toThrow(
      expect.objectContaining<Partial<StoryMemoryRepositoryError>>({
        code: 'ANSWER_NOT_IN_FAMILY',
      }),
    );
    expect(repository.listFacts(otherFamilyId)).toEqual([]);
    expect(database.client.prepare('SELECT count(*) AS count FROM fact_sources').get()).toEqual({
      count: 0,
    });
  });

  it('rolls back the fact when its source insert fails', () => {
    database.client.exec(`
      CREATE TRIGGER reject_fact_source
      BEFORE INSERT ON fact_sources
      BEGIN
        SELECT RAISE(ABORT, 'test source failure');
      END;
    `);

    expect(() =>
      repository.createFactWithSource({
        familyId: demoSeedIds.familyId,
        subjectPersonId: demoSeedIds.rosaPersonId,
        factType: 'childhood_home',
        normalizedValue: 'Pune',
        confidence: 0.9,
        answerId,
      }),
    ).toThrow('test source failure');
    expect(database.client.prepare('SELECT count(*) AS count FROM facts').get()).toEqual({
      count: 0,
    });
    expect(database.client.prepare('SELECT count(*) AS count FROM fact_sources').get()).toEqual({
      count: 0,
    });
  });

  it('creates pending controlled relationships and rejects invalid ownership and types', () => {
    const relationship = repository.createRelationship({
      familyId: demoSeedIds.familyId,
      fromPersonId: demoSeedIds.rosaPersonId,
      toPersonId: rajPersonId,
      relationshipType: 'friend',
      confidence: 0.75,
    });
    expect(relationship.status).toBe('pending');
    expect(repository.findRelationship(demoSeedIds.familyId, relationship.id)).toEqual(
      relationship,
    );
    expect(repository.listRelationships(demoSeedIds.familyId)).toEqual([relationship]);

    const otherFamilyId = addFamily(database, 'Other Family');
    const otherPersonId = addPerson(database, otherFamilyId, 'Other Person');
    expect(() =>
      repository.createRelationship({
        familyId: demoSeedIds.familyId,
        fromPersonId: demoSeedIds.rosaPersonId,
        toPersonId: otherPersonId,
        relationshipType: 'friend',
        confidence: 0.5,
      }),
    ).toThrow(
      expect.objectContaining<Partial<StoryMemoryRepositoryError>>({
        code: 'PERSON_NOT_IN_FAMILY',
      }),
    );
    expect(() =>
      repository.createRelationship({
        familyId: demoSeedIds.familyId,
        fromPersonId: demoSeedIds.rosaPersonId,
        toPersonId: rajPersonId,
        relationshipType: 'guardian',
        confidence: 0.5,
      }),
    ).toThrow();
  });

  it('preserves approximate timeline ranges and rejects cross-family subjects', () => {
    const event = repository.createTimelineEvent({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      eventType: 'move',
      title: 'Moved to Pune',
      description: 'The family moved during the early 1960s.',
      date: { earliestYear: 1962, latestYear: 1964, precision: 'approximate' },
    });

    expect(event).toMatchObject({
      status: 'pending',
      date: { earliestYear: 1962, latestYear: 1964, precision: 'approximate' },
    });
    expect(repository.findTimelineEvent(demoSeedIds.familyId, event.id)).toEqual(event);
    expect(repository.listTimelineEvents(demoSeedIds.familyId)).toEqual([event]);

    const otherFamilyId = addFamily(database, 'Other Family');
    const otherPersonId = addPerson(database, otherFamilyId, 'Other Person');
    expect(() =>
      repository.createTimelineEvent({
        familyId: demoSeedIds.familyId,
        subjectPersonId: otherPersonId,
        eventType: 'move',
        title: 'Moved',
        description: '',
        date: { earliestYear: null, latestYear: null, precision: 'unknown' },
      }),
    ).toThrow(
      expect.objectContaining<Partial<StoryMemoryRepositoryError>>({
        code: 'PERSON_NOT_IN_FAMILY',
      }),
    );
  });

  it('creates family-scoped contradiction records for facts and timeline events', () => {
    const firstFact = createFact(repository, answerId, '1962');
    const secondFact = createFact(repository, answerId, '1964');
    const factConflict = repository.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'fact_value',
      leftFactId: firstFact.id,
      rightFactId: secondFact.id,
    });
    const firstEvent = createTimelineEvent(repository, 1962);
    const secondEvent = createTimelineEvent(repository, 1964);
    const dateConflict = repository.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'timeline_date',
      leftTimelineEventId: firstEvent.id,
      rightTimelineEventId: secondEvent.id,
    });

    expect(factConflict).toMatchObject({ type: 'fact_value', status: 'unresolved' });
    expect(dateConflict).toMatchObject({ type: 'timeline_date', status: 'unresolved' });
    expect(repository.findContradiction(demoSeedIds.familyId, factConflict.id)).toEqual(
      factConflict,
    );
    expect(repository.listContradictions(demoSeedIds.familyId)).toEqual(
      expect.arrayContaining([factConflict, dateConflict]),
    );
    expect(repository.listContradictions(demoSeedIds.familyId)).toHaveLength(2);
    expect(repository.listContradictions(randomUUID())).toEqual([]);

    const otherFamilyId = addFamily(database, 'Other Family');
    expect(() =>
      repository.createContradiction({
        familyId: otherFamilyId,
        type: 'fact_value',
        leftFactId: firstFact.id,
        rightFactId: secondFact.id,
      }),
    ).toThrow(
      expect.objectContaining<Partial<StoryMemoryRepositoryError>>({ code: 'FACT_NOT_IN_FAMILY' }),
    );
  });
});

function createAnswer(database: StoryKeeperDatabase): string {
  const interviews = new DrizzleInterviewRepository(database);
  const interview = interviews.createInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
  const question = interviews.createQuestion({
    familyId: demoSeedIds.familyId,
    interviewId: interview.id,
    text: 'Where did you grow up?',
    sourceReferenceId: 'test-question',
  });
  return interviews.createAnswer({
    familyId: demoSeedIds.familyId,
    interviewId: interview.id,
    questionId: question.id,
    narratorPersonId: demoSeedIds.rosaPersonId,
    rawText: 'We lived in Pune.',
  }).id;
}

function addFamily(database: StoryKeeperDatabase, displayName: string): string {
  const id = randomUUID();
  const now = new Date();
  database.db.insert(families).values({ id, displayName, createdAt: now, updatedAt: now }).run();
  return id;
}

function addPerson(database: StoryKeeperDatabase, familyId: string, displayName: string): string {
  const id = randomUUID();
  const now = new Date();
  database.db.transaction((transaction) => {
    transaction
      .insert(people)
      .values({
        id,
        familyId,
        canonicalDisplayName: displayName,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    transaction
      .insert(familyMemberships)
      .values({
        id: randomUUID(),
        familyId,
        personId: id,
        role: 'relative',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  return id;
}

function createFact(repository: DrizzleStoryMemoryRepository, answerId: string, value: string) {
  return repository.createFactWithSource({
    familyId: demoSeedIds.familyId,
    subjectPersonId: demoSeedIds.rosaPersonId,
    factType: 'move_year',
    normalizedValue: value,
    confidence: 0.8,
    answerId,
  }).fact;
}

function createTimelineEvent(repository: DrizzleStoryMemoryRepository, year: number) {
  return repository.createTimelineEvent({
    familyId: demoSeedIds.familyId,
    subjectPersonId: demoSeedIds.rosaPersonId,
    eventType: 'move',
    title: 'Moved to Pune',
    description: '',
    date: { earliestYear: year, latestYear: year, precision: 'exact' },
  });
}
