import { randomUUID } from 'node:crypto';

import {
  createDatabase,
  demoSeedIds,
  DrizzleInterviewRepository,
  DrizzleNarratorMemoryRepository,
  DrizzlePresentationRepository,
  DrizzlePrivacyRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
  schema,
  seedDemoData,
} from '@story-keeper/database';
import type { ApproximateDate } from '@story-keeper/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StoryKeeperError } from '../src/errors.js';
import { InterviewService } from '../src/interview-service.js';
import { NarratorMemoryService } from '../src/narrator-memory-service.js';
import { PresentationService } from '../src/presentation-service.js';
import { PrivacyService } from '../src/privacy-service.js';

describe('Phase 8 approved presentation read models', () => {
  let database: ReturnType<typeof createDatabase>;
  let memory: DrizzleStoryMemoryRepository;
  let privacy: PrivacyService;
  let presentation: PresentationService;
  let answerId: string;
  let extractionJobId: string;
  let mayaId: string;
  let childId: string;

  beforeEach(() => {
    database = createDatabase(':memory:');
    runMigrations(database);
    seedDemoData(database);
    const interviews = new DrizzleInterviewRepository(database);
    const narratorMemoryRepository = new DrizzleNarratorMemoryRepository(database);
    const narratorMemory = new NarratorMemoryService(interviews, narratorMemoryRepository);
    privacy = new PrivacyService(new DrizzlePrivacyRepository(database), narratorMemoryRepository);
    presentation = new PresentationService(
      new DrizzlePrivacyRepository(database),
      new DrizzlePresentationRepository(database),
    );
    memory = new DrizzleStoryMemoryRepository(database);
    const interviewService = new InterviewService(interviews, narratorMemory);
    const started = interviewService.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    answerId = interviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      'Private source text that must stay outside presentation DTOs.',
    ).answerId;
    const job = database.client
      .prepare('SELECT id FROM jobs WHERE family_id = ? LIMIT 1')
      .get(demoSeedIds.familyId) as { id: string } | undefined;
    if (job === undefined) throw new Error('Expected extraction job.');
    extractionJobId = job.id;
    mayaId = addMember('Maya', 'relative');
    childId = addMember('Asha', 'child');
  });

  afterEach(() => {
    database.close();
  });

  it('returns only approved timeline events with preserved dates and deterministic unknown-last ordering', () => {
    const approximate = createEvent(
      'Approximate move',
      { earliestYear: 1962, latestYear: 1964, precision: 'approximate' },
      'approved',
    );
    const exact = createEvent(
      'Exact move',
      { earliestYear: 1961, latestYear: 1961, precision: 'exact' },
      'approved',
    );
    const unknown = createEvent(
      'Unknown year',
      { earliestYear: null, latestYear: null, precision: 'unknown' },
      'approved',
    );
    const range = createEvent(
      'Year range',
      { earliestYear: 1965, latestYear: 1970, precision: 'range' },
      'approved',
    );
    createEvent('Pending', { earliestYear: 1950, latestYear: 1950, precision: 'exact' }, 'pending');
    createEvent(
      'Rejected',
      { earliestYear: 1951, latestYear: 1951, precision: 'exact' },
      'rejected',
    );

    const relativeResult = presentation.getTimeline(demoSeedIds.familyId, mayaId);
    const childResult = presentation.getTimeline(demoSeedIds.familyId, childId);
    expect(relativeResult.items.map(({ id }) => id)).toEqual([
      exact.id,
      approximate.id,
      range.id,
      unknown.id,
    ]);
    expect(childResult).toEqual(relativeResult);
    expect(presentation.getTimeline(demoSeedIds.familyId, mayaId)).toEqual(relativeResult);
    expect(relativeResult.items[1]?.date).toEqual({
      earliestYear: 1962,
      latestYear: 1964,
      precision: 'approximate',
    });
    expect(relativeResult.items[2]?.date).toEqual({
      earliestYear: 1965,
      latestYear: 1970,
      precision: 'range',
    });
    expect(JSON.stringify(relativeResult)).not.toContain('Private source text');
  });

  it('excludes unresolved contradiction claims from the family-visible timeline', () => {
    const left = createEvent(
      'Moved in 1962',
      { earliestYear: 1962, latestYear: 1962, precision: 'exact' },
      'approved',
    );
    const right = createEvent(
      'Moved in 1964',
      { earliestYear: 1964, latestYear: 1964, precision: 'exact' },
      'approved',
    );
    memory.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'timeline_date',
      leftTimelineEventId: left.id,
      rightTimelineEventId: right.id,
    });

    expect(presentation.getTimeline(demoSeedIds.familyId, mayaId).items).toEqual([]);
  });

  it('returns approved graph edges with unique persisted nodes and excludes unresolved identities', () => {
    const rajId = addMember('Raj', 'relative');
    const leelaId = addMember('Leela', 'relative');
    const first = createRelationship(rajId, 'sibling', 'approved');
    const second = createRelationship(leelaId, 'friend', 'approved');
    createRelationship(childId, 'cousin', 'pending');
    createRelationship(mayaId, 'friend', 'rejected');

    const unresolvedPersonId = addPerson('Unresolved Raj', 'inactive');
    const unresolvedRelationship = createRelationship(unresolvedPersonId, 'friend', 'pending');
    database.client
      .prepare("UPDATE relationships SET approval_status = 'approved' WHERE id = ?")
      .run(unresolvedRelationship.id);
    database.db
      .insert(schema.personCandidates)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        candidatePersonId: unresolvedPersonId,
        answerId,
        jobId: extractionJobId,
        extractedName: 'Unresolved Raj',
        confidence: 1,
        status: 'unresolved',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    const dismissedCandidateId = addPerson('Dismissed Candidate', 'inactive');
    const dismissedRelationship = createRelationship(dismissedCandidateId, 'friend', 'pending');
    database.client
      .prepare("UPDATE relationships SET approval_status = 'approved' WHERE id = ?")
      .run(dismissedRelationship.id);
    database.db
      .insert(schema.personCandidates)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        candidatePersonId: dismissedCandidateId,
        answerId,
        jobId: extractionJobId,
        extractedName: 'Dismissed Candidate',
        confidence: 0.8,
        status: 'dismissed',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    const result = presentation.getFamilyGraph(demoSeedIds.familyId, mayaId);
    expect(result.edges.map(({ relationshipId }) => relationshipId)).toEqual([second.id, first.id]);
    expect(result.nodes.map(({ displayName }) => displayName)).toEqual([
      'Asha',
      'Leela',
      'Maya',
      'Raj',
      'Rosa',
    ]);
    expect(new Set(result.nodes.map(({ personId }) => personId)).size).toBe(result.nodes.length);
    expect(result.nodes.map(({ personId }) => personId)).not.toContain(unresolvedPersonId);
    expect(result.nodes.map(({ personId }) => personId)).not.toContain(dismissedCandidateId);
    const nodeIds = new Set(result.nodes.map(({ personId }) => personId));
    for (const edge of result.edges) {
      expect(nodeIds.has(edge.fromPersonId)).toBe(true);
      expect(nodeIds.has(edge.toPersonId)).toBe(true);
    }
  });

  it('returns only approved chapter cards with bounded metadata and no raw evidence', () => {
    const approvedId = createChapter('approved', new Date('2026-01-02T00:00:00.000Z'));
    createChapter('pending_review', null);
    createChapter('generating', null);
    createChapter('failed', null);
    createChapter('rejected', new Date('2026-01-03T00:00:00.000Z'));
    createChapter('superseded', null);

    const result = presentation.getApprovedChapters(demoSeedIds.familyId, childId);
    expect(result.chapters).toEqual([
      expect.objectContaining({
        chapterId: approvedId,
        narratorPersonId: demoSeedIds.rosaPersonId,
        narratorDisplayName: 'Rosa',
        approvedAt: '2026-01-02T00:00:00.000Z',
        sourceCount: 1,
      }),
    ]);
    expect(Object.keys(result.chapters[0] ?? {}).sort()).toEqual([
      'approvedAt',
      'body',
      'chapterId',
      'narratorDisplayName',
      'narratorPersonId',
      'sourceCount',
      'title',
    ]);
    expect(JSON.stringify(result)).not.toContain('Private source text');
  });

  it('requires active same-family membership for every presentation read', () => {
    const otherFamilyId = randomUUID();
    database.db
      .insert(schema.families)
      .values({
        id: otherFamilyId,
        displayName: 'Other Family',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    for (const read of [
      () => presentation.getTimeline(otherFamilyId, mayaId),
      () => presentation.getFamilyGraph(otherFamilyId, mayaId),
      () => presentation.getApprovedChapters(otherFamilyId, mayaId),
    ]) {
      expect(read).toThrow(
        expect.objectContaining<Partial<StoryKeeperError>>({ code: 'ACTOR_NOT_AUTHORIZED' }),
      );
    }

    const inactiveActorId = addMember('Inactive Actor', 'relative');
    database.client
      .prepare("UPDATE family_memberships SET status = 'inactive' WHERE person_id = ?")
      .run(inactiveActorId);
    for (const actorPersonId of [inactiveActorId, randomUUID()]) {
      for (const read of [
        () => presentation.getTimeline(demoSeedIds.familyId, actorPersonId),
        () => presentation.getFamilyGraph(demoSeedIds.familyId, actorPersonId),
        () => presentation.getApprovedChapters(demoSeedIds.familyId, actorPersonId),
      ]) {
        expect(read).toThrow(
          expect.objectContaining<Partial<StoryKeeperError>>({ code: 'ACTOR_NOT_AUTHORIZED' }),
        );
      }
    }
  });

  function addPerson(displayName: string, status: 'active' | 'inactive' = 'active'): string {
    const personId = randomUUID();
    database.db
      .insert(schema.people)
      .values({
        id: personId,
        familyId: demoSeedIds.familyId,
        canonicalDisplayName: displayName,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    return personId;
  }

  function addMember(displayName: string, role: 'narrator' | 'relative' | 'child'): string {
    const personId = addPerson(displayName);
    database.db
      .insert(schema.familyMemberships)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        personId,
        role,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    return personId;
  }

  function createEvent(
    title: string,
    date: ApproximateDate,
    status: 'pending' | 'approved' | 'rejected',
  ) {
    const event = memory.createTimelineEvent({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      eventType: 'move',
      title,
      description: `${title} description`,
      date,
    });
    database.db
      .insert(schema.timelineEventSources)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        timelineEventId: event.id,
        answerId,
        jobId: extractionJobId,
        createdAt: new Date(),
      })
      .run();
    if (status !== 'pending') {
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'timeline_event',
        event.id,
        status === 'approved' ? 'approve' : 'reject',
      );
    }
    return event;
  }

  function createRelationship(
    toPersonId: string,
    relationshipType: 'sibling' | 'friend' | 'cousin',
    status: 'pending' | 'approved' | 'rejected',
  ) {
    const relationship = memory.createRelationship({
      familyId: demoSeedIds.familyId,
      fromPersonId: demoSeedIds.rosaPersonId,
      toPersonId,
      relationshipType,
      confidence: 0.9,
    });
    database.db
      .insert(schema.relationshipSources)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        relationshipId: relationship.id,
        answerId,
        jobId: extractionJobId,
        createdAt: new Date(),
      })
      .run();
    if (status !== 'pending') {
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'relationship',
        relationship.id,
        status === 'approved' ? 'approve' : 'reject',
      );
    }
    return relationship;
  }

  function createChapter(
    status: 'generating' | 'pending_review' | 'approved' | 'rejected' | 'failed' | 'superseded',
    reviewedAt: Date | null,
  ) {
    const chapterId = randomUUID();
    const jobId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.jobs)
      .values({
        id: jobId,
        familyId: demoSeedIds.familyId,
        type: 'draft_chapter',
        payload: JSON.stringify({ chapterDraftId: chapterId, sources: [] }),
        deduplicationKey: `test:${chapterId}`,
        status: 'succeeded',
        attemptCount: 1,
        maxAttempts: 3,
        availableAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(schema.chapterDrafts)
      .values({
        id: chapterId,
        familyId: demoSeedIds.familyId,
        narratorPersonId: demoSeedIds.rosaPersonId,
        requestedTopic: 'childhood',
        title: status === 'generating' || status === 'failed' ? null : 'A grounded chapter',
        body:
          status === 'generating' || status === 'failed'
            ? null
            : 'Only approved structured memory appears here.',
        status,
        generationJobId: jobId,
        reviewedByPersonId:
          status === 'approved' || status === 'rejected' ? demoSeedIds.rosaPersonId : null,
        reviewedAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (status !== 'generating' && status !== 'failed') {
      database.db
        .insert(schema.chapterSources)
        .values({
          id: randomUUID(),
          familyId: demoSeedIds.familyId,
          chapterDraftId: chapterId,
          sourceType: 'timeline_event',
          sourceId: randomUUID(),
          sourceLabel: 'Safe source label',
          sourceSummary: 'Safe structured source summary.',
          createdAt: now,
        })
        .run();
    }
    return chapterId;
  }
});
