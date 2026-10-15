import { randomUUID } from 'node:crypto';

import {
  createDatabase,
  demoSeedIds,
  DrizzleInterviewRepository,
  DrizzleNarratorMemoryRepository,
  DrizzlePrivacyRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
  schema,
  seedDemoData,
} from '@story-keeper/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StoryKeeperError } from '../src/errors.js';
import { InterviewService } from '../src/interview-service.js';
import { NarratorMemoryService } from '../src/narrator-memory-service.js';
import { PrivacyService } from '../src/privacy-service.js';

describe('Phase 5 approval and privacy boundary', () => {
  let database: ReturnType<typeof createDatabase>;
  let interviews: DrizzleInterviewRepository;
  let memory: DrizzleStoryMemoryRepository;
  let narratorMemory: NarratorMemoryService;
  let privacy: PrivacyService;
  let interviewId: string;
  let answerId: string;
  let jobId: string;
  let mayaId: string;
  let childId: string;

  beforeEach(() => {
    database = createDatabase(':memory:');
    runMigrations(database);
    seedDemoData(database);
    interviews = new DrizzleInterviewRepository(database);
    const narratorRepository = new DrizzleNarratorMemoryRepository(database);
    narratorMemory = new NarratorMemoryService(interviews, narratorRepository);
    privacy = new PrivacyService(new DrizzlePrivacyRepository(database), narratorRepository);
    memory = new DrizzleStoryMemoryRepository(database);
    const interviewService = new InterviewService(interviews, narratorMemory);
    const started = interviewService.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    interviewId = started.interviewId;
    answerId = interviewService.saveAnswer(
      demoSeedIds.familyId,
      interviewId,
      started.questionId,
      'A private source answer.',
    ).answerId;
    const job = database.client
      .prepare('SELECT id FROM jobs WHERE family_id = ? LIMIT 1')
      .get(demoSeedIds.familyId) as { id: string } | undefined;
    if (job === undefined) throw new Error('Expected the extraction job.');
    jobId = job.id;
    mayaId = addMember('Maya', 'relative');
    childId = addMember('Asha', 'child');
  });

  afterEach(() => {
    database.close();
  });

  it('hides pending memory from relatives and children, then exposes it after explicit approval', () => {
    const fact = createFact('home_city', 'Delhi');

    expect(contextIds(mayaId).facts).not.toContain(fact.id);
    expect(contextIds(childId).facts).not.toContain(fact.id);
    expect(contextIds(demoSeedIds.rosaPersonId).facts).toContain(fact.id);

    expect(
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'fact',
        fact.id,
        'approve',
      ),
    ).toMatchObject({ status: 'updated', itemStatus: 'approved' });
    expect(
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'fact',
        fact.id,
        'approve',
      ),
    ).toMatchObject({ status: 'already_applied', itemStatus: 'approved' });

    expect(contextIds(mayaId).facts).toContain(fact.id);
    expect(contextIds(childId).facts).toContain(fact.id);
    expect(database.db.select().from(schema.approvals).all()).toHaveLength(1);
    expect(database.db.select().from(schema.consentEvents).all()).toHaveLength(1);
    expect(memory.listFactSources(demoSeedIds.familyId, fact.id)).toHaveLength(1);
    expect(() =>
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'fact',
        fact.id,
        'reject',
      ),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'STORY_ITEM_STATE_CONFLICT' }),
    );
  });

  it('approves sourced relationships and timeline events and rejects a pending fact', () => {
    const knownPersonId = addMember('Known Raj', 'relative');
    const relationship = memory.createRelationship({
      familyId: demoSeedIds.familyId,
      fromPersonId: demoSeedIds.rosaPersonId,
      toPersonId: knownPersonId,
      relationshipType: 'sibling',
      confidence: 0.9,
    });
    addRelationshipSource(relationship.id);
    const event = memory.createTimelineEvent({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      eventType: 'move',
      title: 'Moved to Delhi',
      description: 'A remembered move.',
      date: { earliestYear: 1962, latestYear: 1964, precision: 'approximate' },
    });
    addTimelineSource(event.id);
    const rejected = createFact('favorite_color', 'blue');

    privacy.approveStoryItem(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'relationship',
      relationship.id,
      'approve',
    );
    privacy.approveStoryItem(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'timeline_event',
      event.id,
      'approve',
    );
    privacy.approveStoryItem(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'fact',
      rejected.id,
      'reject',
    );

    const relativeContext = contextIds(mayaId);
    expect(relativeContext.relationships).toContain(relationship.id);
    expect(relativeContext.timelineEvents).toContain(event.id);
    expect(relativeContext.facts).not.toContain(rejected.id);
    expect(memory.listFactSources(demoSeedIds.familyId, rejected.id)).toHaveLength(1);
  });

  it('requires valid provenance for every approvable story-item type', () => {
    const factId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.facts)
      .values({
        id: factId,
        familyId: demoSeedIds.familyId,
        subjectPersonId: demoSeedIds.rosaPersonId,
        factType: 'unsupported_claim',
        normalizedValue: 'No source',
        confidence: 0.5,
        approvalStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const knownPersonId = addMember('Known Person', 'relative');
    const relationship = memory.createRelationship({
      familyId: demoSeedIds.familyId,
      fromPersonId: demoSeedIds.rosaPersonId,
      toPersonId: knownPersonId,
      relationshipType: 'friend',
      confidence: 0.8,
    });
    const event = memory.createTimelineEvent({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      eventType: 'visit',
      title: 'A visit',
      description: 'No source was attached.',
      date: { earliestYear: null, latestYear: null, precision: 'unknown' },
    });

    for (const target of [
      { type: 'fact' as const, id: factId },
      { type: 'relationship' as const, id: relationship.id },
      { type: 'timeline_event' as const, id: event.id },
    ]) {
      expect(() =>
        privacy.approveStoryItem(
          demoSeedIds.familyId,
          demoSeedIds.rosaPersonId,
          target.type,
          target.id,
          'approve',
        ),
      ).toThrow(
        expect.objectContaining<Partial<StoryKeeperError>>({
          code: 'STORY_ITEM_PROVENANCE_REQUIRED',
        }),
      );
    }
    expect(memory.findFact(demoSeedIds.familyId, factId)?.status).toBe('pending');
    expect(memory.findRelationship(demoSeedIds.familyId, relationship.id)?.status).toBe('pending');
    expect(memory.findTimelineEvent(demoSeedIds.familyId, event.id)?.status).toBe('pending');
  });

  it('does not let approval bypass an unresolved person candidate', () => {
    const candidatePersonId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.people)
      .values({
        id: candidatePersonId,
        familyId: demoSeedIds.familyId,
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
        familyId: demoSeedIds.familyId,
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
      familyId: demoSeedIds.familyId,
      fromPersonId: demoSeedIds.rosaPersonId,
      toPersonId: candidatePersonId,
      relationshipType: 'sibling',
      confidence: 0.9,
    });
    addRelationshipSource(relationship.id);

    expect(() =>
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'relationship',
        relationship.id,
        'approve',
      ),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({
        code: 'STORY_ITEM_IDENTITY_UNRESOLVED',
      }),
    );
    expect(memory.findRelationship(demoSeedIds.familyId, relationship.id)?.status).toBe('pending');
  });

  it('returns only safe narrator-scoped confirmed and unresolved identity references', () => {
    const possibleMatchPersonId = addMember('Raj Sharma', 'relative');
    const trustedPersonId = addMember('Leela', 'relative');
    const singleMatchCandidatePersonId = addCandidate({
      displayName: 'Raj',
      possibleMatchPersonId,
    });
    const tiedCandidatePersonId = addCandidate({ displayName: 'Raj' });
    const trustedRelationship = memory.createRelationship({
      familyId: demoSeedIds.familyId,
      fromPersonId: demoSeedIds.rosaPersonId,
      toPersonId: trustedPersonId,
      relationshipType: 'friend',
      confidence: 1,
    });
    const unresolvedRelationship = memory.createRelationship({
      familyId: demoSeedIds.familyId,
      fromPersonId: demoSeedIds.rosaPersonId,
      toPersonId: singleMatchCandidatePersonId,
      relationshipType: 'sibling',
      confidence: 1,
    });

    const otherFamily = addFamily('Other Family', 'Other Narrator');
    const otherInterviewService = new InterviewService(
      interviews,
      new NarratorMemoryService(interviews, new DrizzleNarratorMemoryRepository(database)),
    );
    const otherStarted = otherInterviewService.startInterview(
      otherFamily.familyId,
      otherFamily.personId,
    );
    const otherAnswerId = otherInterviewService.saveAnswer(
      otherFamily.familyId,
      otherStarted.interviewId,
      otherStarted.questionId,
      'Another family mentioned Secret Raj.',
    ).answerId;
    const otherJob = database.client
      .prepare('SELECT id FROM jobs WHERE family_id = ? LIMIT 1')
      .get(otherFamily.familyId) as { id: string } | undefined;
    if (otherJob === undefined) throw new Error('Expected the other-family extraction job.');
    addCandidate({
      familyId: otherFamily.familyId,
      answerId: otherAnswerId,
      jobId: otherJob.id,
      displayName: 'Secret Raj',
    });

    const narratorContext = privacy.getStoryContext(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    expect(narratorContext.relationships.map(({ id }) => id)).toEqual(
      expect.arrayContaining([trustedRelationship.id, unresolvedRelationship.id]),
    );
    expect(narratorContext.personIdentities).toEqual(
      expect.arrayContaining([
        {
          personId: trustedPersonId,
          status: 'confirmed',
          displayName: 'Leela',
        },
        {
          personId: singleMatchCandidatePersonId,
          status: 'unresolved',
          extractedDisplayName: 'Raj',
          possibleMatchDisplayName: 'Raj Sharma',
        },
        {
          personId: tiedCandidatePersonId,
          status: 'unresolved',
          extractedDisplayName: 'Raj',
          possibleMatchDisplayName: null,
        },
      ]),
    );
    expect(singleMatchCandidatePersonId).not.toBe(possibleMatchPersonId);
    expect(tiedCandidatePersonId).not.toBe(possibleMatchPersonId);
    expect(JSON.stringify(narratorContext)).not.toContain('A private source answer.');
    expect(JSON.stringify(narratorContext)).not.toContain('Secret Raj');
    expect(JSON.stringify(narratorContext)).not.toMatch(/matchScore|answerId|candidateId/);
    expect(privacy.getStoryContext(demoSeedIds.familyId, mayaId).personIdentities).toEqual([]);
    expect(privacy.getStoryContext(demoSeedIds.familyId, childId).personIdentities).toEqual([]);
  });

  it('enforces actor role and family scope', () => {
    const fact = createFact('home_city', 'Delhi');
    const otherFamily = addFamily('Other Family', 'Other Narrator');

    expect(() =>
      privacy.approveStoryItem(demoSeedIds.familyId, mayaId, 'fact', fact.id, 'approve'),
    ).toThrow(expect.objectContaining<Partial<StoryKeeperError>>({ code: 'ACTOR_NOT_AUTHORIZED' }));
    expect(() => privacy.getStoryContext(otherFamily.familyId, demoSeedIds.rosaPersonId)).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'ACTOR_NOT_AUTHORIZED' }),
    );
    expect(() =>
      privacy.approveStoryItem(
        otherFamily.familyId,
        otherFamily.personId,
        'fact',
        fact.id,
        'approve',
      ),
    ).toThrow(expect.objectContaining<Partial<StoryKeeperError>>({ code: 'STORY_ITEM_NOT_FOUND' }));
    expect(() =>
      privacy.deletePendingMemory(demoSeedIds.familyId, mayaId, 'fact', fact.id),
    ).toThrow(expect.objectContaining<Partial<StoryKeeperError>>({ code: 'ACTOR_NOT_AUTHORIZED' }));
    expect(() =>
      privacy.deletePendingMemory(otherFamily.familyId, otherFamily.personId, 'fact', fact.id),
    ).toThrow(expect.objectContaining<Partial<StoryKeeperError>>({ code: 'STORY_ITEM_NOT_FOUND' }));
  });

  it('tombstones pending memory idempotently while preserving evidence and hiding conflicts', () => {
    const left = createFact('move_year', '1962');
    const right = createFact('move_year', '1964');
    memory.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });
    expect(
      privacy.getStoryContext(demoSeedIds.familyId, demoSeedIds.rosaPersonId).conflicts,
    ).toHaveLength(1);
    expect(privacy.getStoryContext(demoSeedIds.familyId, mayaId).conflicts).toEqual([]);

    expect(
      privacy.deletePendingMemory(demoSeedIds.familyId, demoSeedIds.rosaPersonId, 'fact', left.id),
    ).toMatchObject({ status: 'deleted', itemStatus: 'rejected' });
    expect(
      privacy.deletePendingMemory(demoSeedIds.familyId, demoSeedIds.rosaPersonId, 'fact', left.id),
    ).toMatchObject({ status: 'already_deleted' });

    expect(contextIds(demoSeedIds.rosaPersonId).facts).not.toContain(left.id);
    expect(contextIds(mayaId).facts).not.toContain(left.id);
    expect(
      privacy.getStoryContext(demoSeedIds.familyId, demoSeedIds.rosaPersonId).conflicts,
    ).toEqual([]);
    expect(memory.listFactSources(demoSeedIds.familyId, left.id)).toHaveLength(1);
    expect(
      database.db.select({ rawText: schema.answers.rawText }).from(schema.answers).all(),
    ).toContainEqual({ rawText: 'A private source answer.' });
    expect(memory.listContradictions(demoSeedIds.familyId)).toHaveLength(1);
  });

  it('refuses pending deletion of approved memory and supports explicit revocation', () => {
    const fact = createFact('home_city', 'Delhi');
    privacy.approveStoryItem(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'fact',
      fact.id,
      'approve',
    );

    expect(() =>
      privacy.deletePendingMemory(demoSeedIds.familyId, demoSeedIds.rosaPersonId, 'fact', fact.id),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'STORY_ITEM_STATE_CONFLICT' }),
    );
    expect(
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'fact',
        fact.id,
        'revoke',
      ),
    ).toMatchObject({ status: 'updated', itemStatus: 'rejected' });
    expect(
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'fact',
        fact.id,
        'revoke',
      ),
    ).toMatchObject({ status: 'already_applied', itemStatus: 'rejected' });
    expect(contextIds(mayaId).facts).not.toContain(fact.id);
  });

  it('keeps contradiction resolution separate from approval', () => {
    const left = createFact('move_year', '1962');
    const right = createFact('move_year', '1964');
    const contradiction = memory.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });

    narratorMemory.resolveConflict(
      demoSeedIds.familyId,
      interviewId,
      contradiction.id,
      'keep_right',
    );

    expect(memory.findFact(demoSeedIds.familyId, left.id)?.status).toBe('rejected');
    expect(memory.findFact(demoSeedIds.familyId, right.id)?.status).toBe('pending');
    expect(contextIds(mayaId).facts).not.toContain(right.id);
  });

  function createFact(factType: string, value: string) {
    return memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType,
      normalizedValue: value,
      confidence: 0.9,
      answerId,
    }).fact;
  }

  function addRelationshipSource(relationshipId: string): void {
    database.db
      .insert(schema.relationshipSources)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        relationshipId,
        answerId,
        jobId,
        createdAt: new Date(),
      })
      .run();
  }

  function addTimelineSource(timelineEventId: string): void {
    database.db
      .insert(schema.timelineEventSources)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        timelineEventId,
        answerId,
        jobId,
        createdAt: new Date(),
      })
      .run();
  }

  function addCandidate({
    familyId = demoSeedIds.familyId,
    answerId: candidateAnswerId = answerId,
    jobId: candidateJobId = jobId,
    displayName,
    possibleMatchPersonId = null,
  }: {
    readonly familyId?: string;
    readonly answerId?: string;
    readonly jobId?: string;
    readonly displayName: string;
    readonly possibleMatchPersonId?: string | null;
  }): string {
    const personId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.people)
      .values({
        id: personId,
        familyId,
        canonicalDisplayName: displayName,
        status: 'inactive',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(schema.personCandidates)
      .values({
        id: randomUUID(),
        familyId,
        candidatePersonId: personId,
        answerId: candidateAnswerId,
        jobId: candidateJobId,
        extractedName: displayName,
        confidence: 1,
        status: 'unresolved',
        possibleMatchPersonId,
        matchScore: possibleMatchPersonId === null ? null : 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return personId;
  }

  function contextIds(actorPersonId: string) {
    const context = privacy.getStoryContext(demoSeedIds.familyId, actorPersonId);
    return {
      facts: context.facts.map(({ id }) => id),
      relationships: context.relationships.map(({ id }) => id),
      timelineEvents: context.timelineEvents.map(({ id }) => id),
    };
  }

  function addMember(
    displayName: string,
    role: 'narrator' | 'relative' | 'child',
    familyId: string = demoSeedIds.familyId,
  ): string {
    const personId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.people)
      .values({
        id: personId,
        familyId,
        canonicalDisplayName: displayName,
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
        personId,
        role,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return personId;
  }

  function addFamily(displayName: string, narratorName: string) {
    const familyId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.families)
      .values({ id: familyId, displayName, createdAt: now, updatedAt: now })
      .run();
    const personId = addMember(narratorName, 'narrator', familyId);
    return { familyId, personId };
  }
});
