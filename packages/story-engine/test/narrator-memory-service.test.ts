import { randomUUID } from 'node:crypto';

import {
  createDatabase,
  demoSeedIds,
  DrizzleInterviewRepository,
  DrizzleJobRepository,
  DrizzleNarratorMemoryRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
  seedDemoData,
  schema,
  type StoryKeeperDatabase,
} from '@story-keeper/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StoryKeeperError } from '../src/errors.js';
import { InterviewService } from '../src/interview-service.js';
import { NarratorMemoryService } from '../src/narrator-memory-service.js';

describe('NarratorMemoryService', () => {
  let database: StoryKeeperDatabase;
  let interviews: DrizzleInterviewRepository;
  let memory: DrizzleStoryMemoryRepository;
  let narratorMemory: NarratorMemoryService;
  let interviewService: InterviewService;
  let interviewId: string;
  let answerId: string;

  beforeEach(() => {
    database = createDatabase(':memory:');
    runMigrations(database);
    seedDemoData(database);
    interviews = new DrizzleInterviewRepository(database);
    memory = new DrizzleStoryMemoryRepository(database);
    narratorMemory = new NarratorMemoryService(
      interviews,
      new DrizzleNarratorMemoryRepository(database),
    );
    interviewService = new InterviewService(interviews, narratorMemory);
    const started = interviewService.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    interviewId = started.interviewId;
    answerId = interviewService.saveAnswer(
      demoSeedIds.familyId,
      interviewId,
      started.questionId,
      'We moved in 1962, although I also remember 1964.',
    ).answerId;
  });

  afterEach(() => {
    database.close();
  });

  it('lists only unresolved narrator conflicts with source details and gentle phrasing', () => {
    const contradiction = createFactConflict(demoSeedIds.rosaPersonId);
    const otherPersonId = addFamilyMember(demoSeedIds.familyId, 'Other Narrator');
    createFactConflict(otherPersonId);

    const result = narratorMemory.listPendingConflicts(demoSeedIds.familyId, interviewId);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      contradictionId: contradiction.id,
      contradictionType: 'fact_value',
      status: 'unresolved',
      left: { kind: 'fact', sourceAnswerIds: [answerId] },
      right: { kind: 'fact', sourceAnswerIds: [answerId] },
    });
    expect(result.conflicts[0]?.suggestedQuestion).toContain('I remember you mentioning both');
    expect(result.conflicts[0]?.suggestedQuestion).not.toMatch(/wrong|mistake/i);
  });

  it('keeps the selected fact pending, rejects only the losing candidate, and preserves evidence', () => {
    const contradiction = createFactConflict(demoSeedIds.rosaPersonId);
    const listed = narratorMemory.listPendingConflicts(demoSeedIds.familyId, interviewId)
      .conflicts[0];
    if (listed?.left.kind !== 'fact' || listed.right.kind !== 'fact') {
      throw new Error('Expected a fact contradiction.');
    }

    const resolved = narratorMemory.resolveConflict(
      demoSeedIds.familyId,
      interviewId,
      contradiction.id,
      'keep_left',
    );

    expect(resolved).toMatchObject({
      status: 'resolved',
      resolutionType: 'keep_left',
      resolvedByPersonId: demoSeedIds.rosaPersonId,
    });
    expect(
      database.client
        .prepare(
          'SELECT status, resolution_type, resolved_by_person_id, resolved_at IS NOT NULL AS has_resolved_at FROM contradictions WHERE id = ?',
        )
        .get(contradiction.id),
    ).toEqual({
      status: 'resolved',
      resolution_type: 'keep_left',
      resolved_by_person_id: demoSeedIds.rosaPersonId,
      has_resolved_at: 1,
    });
    expect(memory.findFact(demoSeedIds.familyId, listed.left.itemId)?.status).toBe('pending');
    expect(memory.findFact(demoSeedIds.familyId, listed.right.itemId)?.status).toBe('rejected');
    expect(memory.listFactSources(demoSeedIds.familyId, listed.right.itemId)).toEqual([
      expect.objectContaining({ answerId }),
    ]);
    expect(
      database.client.prepare('SELECT raw_text FROM answers WHERE id = ?').get(answerId),
    ).toEqual({ raw_text: 'We moved in 1962, although I also remember 1964.' });
    expect(
      narratorMemory.listPendingConflicts(demoSeedIds.familyId, interviewId).conflicts,
    ).toEqual([]);
  });

  it('supports keep_right without approving the surviving fact', () => {
    const contradiction = createFactConflict(demoSeedIds.rosaPersonId);
    const listed = narratorMemory.listPendingConflicts(demoSeedIds.familyId, interviewId)
      .conflicts[0];
    if (listed?.left.kind !== 'fact' || listed.right.kind !== 'fact') {
      throw new Error('Expected a fact contradiction.');
    }

    narratorMemory.resolveConflict(
      demoSeedIds.familyId,
      interviewId,
      contradiction.id,
      'keep_right',
    );

    expect(memory.findFact(demoSeedIds.familyId, listed.left.itemId)?.status).toBe('rejected');
    expect(memory.findFact(demoSeedIds.familyId, listed.right.itemId)?.status).toBe('pending');
  });

  it('keeps both timeline candidates pending when they are different events', () => {
    const contradiction = createTimelineConflict();
    const listed = narratorMemory.listPendingConflicts(demoSeedIds.familyId, interviewId)
      .conflicts[0];
    expect(listed?.suggestedQuestion).toContain('around 1961 to 1962');
    expect(listed?.suggestedQuestion).toContain('1964');

    const resolved = narratorMemory.resolveConflict(
      demoSeedIds.familyId,
      interviewId,
      contradiction.id,
      'different_events',
    );

    expect(resolved.status).toBe('resolved');
    expect(memory.findTimelineEvent(demoSeedIds.familyId, contradiction.leftId)?.status).toBe(
      'pending',
    );
    expect(memory.findTimelineEvent(demoSeedIds.familyId, contradiction.rightId)?.status).toBe(
      'pending',
    );
  });

  it('dismisses a non-conflict while preserving both pending claims', () => {
    const contradiction = createFactConflict(demoSeedIds.rosaPersonId);
    const result = narratorMemory.resolveConflict(
      demoSeedIds.familyId,
      interviewId,
      contradiction.id,
      'dismiss_not_a_conflict',
    );

    expect(result.status).toBe('dismissed');
    expect(memory.findFact(demoSeedIds.familyId, contradiction.leftId)?.status).toBe('pending');
    expect(memory.findFact(demoSeedIds.familyId, contradiction.rightId)?.status).toBe('pending');
  });

  it('is idempotent for an identical resolution and rejects a conflicting stale request', () => {
    const contradiction = createFactConflict(demoSeedIds.rosaPersonId);
    narratorMemory.resolveConflict(
      demoSeedIds.familyId,
      interviewId,
      contradiction.id,
      'keep_left',
    );

    expect(
      narratorMemory.resolveConflict(
        demoSeedIds.familyId,
        interviewId,
        contradiction.id,
        'keep_left',
      ).status,
    ).toBe('already_resolved');
    expect(() =>
      narratorMemory.resolveConflict(
        demoSeedIds.familyId,
        interviewId,
        contradiction.id,
        'keep_right',
      ),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'CONFLICT_ALREADY_RESOLVED' }),
    );
  });

  it('rolls back the losing-item update when the contradiction transition fails', () => {
    const contradiction = createFactConflict(demoSeedIds.rosaPersonId);
    database.client.exec(`
      CREATE TRIGGER reject_conflict_resolution
      BEFORE UPDATE ON contradictions
      BEGIN
        SELECT RAISE(ABORT, 'test resolution failure');
      END;
    `);

    expect(() =>
      narratorMemory.resolveConflict(
        demoSeedIds.familyId,
        interviewId,
        contradiction.id,
        'keep_left',
      ),
    ).toThrow('test resolution failure');
    expect(memory.findFact(demoSeedIds.familyId, contradiction.leftId)?.status).toBe('pending');
    expect(memory.findFact(demoSeedIds.familyId, contradiction.rightId)?.status).toBe('pending');
    expect(memory.findContradiction(demoSeedIds.familyId, contradiction.id)?.status).toBe(
      'unresolved',
    );
  });

  it('blocks cross-family and unrelated-narrator conflict access', () => {
    const contradiction = createFactConflict(demoSeedIds.rosaPersonId);
    const otherFamily = addFamily('Other Family', 'Other Narrator');

    expect(
      narratorMemory.listPendingConflicts(otherFamily.familyId, otherFamily.interviewId).conflicts,
    ).toEqual([]);

    expect(() =>
      narratorMemory.resolveConflict(
        otherFamily.familyId,
        otherFamily.interviewId,
        contradiction.id,
        'keep_left',
      ),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'CONTRADICTION_NOT_FOUND' }),
    );

    const otherPersonId = addFamilyMember(demoSeedIds.familyId, 'Second Narrator');
    const otherInterview = interviews.createInterview(demoSeedIds.familyId, otherPersonId);
    expect(() =>
      narratorMemory.resolveConflict(
        demoSeedIds.familyId,
        otherInterview.id,
        contradiction.id,
        'keep_left',
      ),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'CONTRADICTION_NOT_FOUND' }),
    );
  });

  it('does not expose pending claims sourced only from another narrator', () => {
    const otherPersonId = addFamilyMember(demoSeedIds.familyId, 'Second Narrator');
    const otherInterviewService = new InterviewService(interviews);
    const started = otherInterviewService.startInterview(demoSeedIds.familyId, otherPersonId);
    const otherAnswerId = otherInterviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      'I remember Rosa moving in a different year.',
    ).answerId;
    const left = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1962',
      confidence: 0.8,
      answerId: otherAnswerId,
    }).fact;
    const right = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1964',
      confidence: 0.8,
      answerId: otherAnswerId,
    }).fact;
    memory.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });

    expect(
      narratorMemory.listPendingConflicts(demoSeedIds.familyId, interviewId).conflicts,
    ).toEqual([]);
  });

  it('prioritizes a conflict, reuses its unanswered question, then advances to person clarification', () => {
    const contradiction = createFactConflict(demoSeedIds.rosaPersonId);
    addPersonCandidate('Raj');

    const first = interviewService.getNextQuestion(demoSeedIds.familyId, interviewId);
    const repeated = interviewService.getNextQuestion(demoSeedIds.familyId, interviewId);

    expect(first.questionText).toContain('I remember you mentioning both');
    expect(repeated).toEqual(first);
    expect(
      database.client
        .prepare("SELECT count(*) AS count FROM questions WHERE source = 'contradiction'")
        .get(),
    ).toEqual({ count: 1 });

    narratorMemory.resolveConflict(
      demoSeedIds.familyId,
      interviewId,
      contradiction.id,
      'keep_left',
    );
    const next = interviewService.getNextQuestion(demoSeedIds.familyId, interviewId);
    expect(next.questionText).toBe('You mentioned Raj. How was Raj connected to you?');
  });

  it('uses a deterministic event follow-up before the next unused fallback question', () => {
    const event = memory.createTimelineEvent({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      eventType: 'move',
      title: 'moving to Delhi',
      description: 'A short memory.',
      date: { earliestYear: 1962, latestYear: 1964, precision: 'approximate' },
    });
    addTimelineSource(event.id);

    const next = interviewService.getNextQuestion(demoSeedIds.familyId, interviewId);

    expect(next.questionText).toBe('What do you remember most about “moving to Delhi”?');
  });

  it('still reaches complete when no structured-memory question remains', () => {
    let next = interviewService.getNextQuestion(demoSeedIds.familyId, interviewId);
    while (next.status === 'question' && next.questionId !== null) {
      interviewService.saveAnswer(
        demoSeedIds.familyId,
        interviewId,
        next.questionId,
        'A fallback answer.',
      );
      next = interviewService.getNextQuestion(demoSeedIds.familyId, interviewId);
    }

    expect(next).toEqual({
      status: 'complete',
      interviewId,
      questionId: null,
      questionText: null,
    });
  });

  function createFactConflict(subjectPersonId: string) {
    const left = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId,
      factType: 'move_year',
      normalizedValue: '1962',
      confidence: 0.9,
      answerId,
    }).fact;
    const right = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId,
      factType: 'move_year',
      normalizedValue: '1964',
      confidence: 0.9,
      answerId,
    }).fact;
    const contradiction = memory.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });
    return { ...contradiction, leftId: left.id, rightId: right.id };
  }

  function createTimelineConflict() {
    const left = memory.createTimelineEvent({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      eventType: 'move',
      title: 'Moved to Delhi',
      description: 'First account.',
      date: { earliestYear: 1961, latestYear: 1962, precision: 'approximate' },
    });
    const right = memory.createTimelineEvent({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      eventType: 'move',
      title: 'Moved to Delhi',
      description: 'Second account.',
      date: { earliestYear: 1964, latestYear: 1964, precision: 'exact' },
    });
    addTimelineSource(left.id);
    addTimelineSource(right.id);
    const contradiction = memory.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'timeline_date',
      leftTimelineEventId: left.id,
      rightTimelineEventId: right.id,
    });
    return { ...contradiction, leftId: left.id, rightId: right.id };
  }

  function addPersonCandidate(name: string): void {
    const job = new DrizzleJobRepository(database).listByFamily(demoSeedIds.familyId)[0];
    if (job === undefined) throw new Error('Expected an extraction job.');
    const personId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.people)
      .values({
        id: personId,
        familyId: demoSeedIds.familyId,
        canonicalDisplayName: name,
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
        candidatePersonId: personId,
        answerId,
        jobId: job.id,
        extractedName: name,
        confidence: 1,
        status: 'unresolved',
        possibleMatchPersonId: null,
        matchScore: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  function addTimelineSource(timelineEventId: string): void {
    const job = new DrizzleJobRepository(database).listByFamily(demoSeedIds.familyId)[0];
    if (job === undefined) throw new Error('Expected an extraction job.');
    database.db
      .insert(schema.timelineEventSources)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        timelineEventId,
        answerId,
        jobId: job.id,
        createdAt: new Date(),
      })
      .run();
  }

  function addFamilyMember(familyId: string, displayName: string): string {
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
        role: 'narrator',
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
      .values({
        id: familyId,
        displayName,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const personId = addFamilyMember(familyId, narratorName);
    const interview = interviews.createInterview(familyId, personId);
    return { familyId, personId, interviewId: interview.id };
  }
});
