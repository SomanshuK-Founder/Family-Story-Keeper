import { randomUUID } from 'node:crypto';

import {
  createDatabase,
  demoSeedIds,
  DrizzleFamilyQuestionRepository,
  DrizzleInterviewRepository,
  DrizzleNarratorMemoryRepository,
  DrizzlePrivacyRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
  schema,
  seedDemoData,
} from '@story-keeper/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StoryKeeperError } from '../src/errors.js';
import { FamilyQuestionService } from '../src/family-question-service.js';
import { InterviewService } from '../src/interview-service.js';
import { NarratorMemoryService } from '../src/narrator-memory-service.js';
import { PrivacyService } from '../src/privacy-service.js';

describe('Phase 6 family question queue', () => {
  let database: ReturnType<typeof createDatabase>;
  let queueRepository: DrizzleFamilyQuestionRepository;
  let familyQuestions: FamilyQuestionService;
  let interviews: DrizzleInterviewRepository;
  let interviewService: InterviewService;
  let narratorMemory: NarratorMemoryService;
  let privacy: PrivacyService;
  let memory: DrizzleStoryMemoryRepository;
  let mayaId: string;
  let childId: string;

  beforeEach(() => {
    database = createDatabase(':memory:');
    runMigrations(database);
    seedDemoData(database);
    mayaId = addMember(demoSeedIds.familyId, 'Maya', 'relative');
    childId = addMember(demoSeedIds.familyId, 'Asha', 'child');
    queueRepository = new DrizzleFamilyQuestionRepository(database);
    familyQuestions = new FamilyQuestionService(queueRepository);
    interviews = new DrizzleInterviewRepository(database);
    const narratorRepository = new DrizzleNarratorMemoryRepository(database);
    narratorMemory = new NarratorMemoryService(interviews, narratorRepository);
    interviewService = new InterviewService(interviews, narratorMemory, familyQuestions);
    privacy = new PrivacyService(new DrizzlePrivacyRepository(database), narratorRepository);
    memory = new DrizzleStoryMemoryRepository(database);
  });

  afterEach(() => {
    database.close();
  });

  it('allows relatives and children to queue trimmed questions for an active narrator', () => {
    const relative = familyQuestions.queueFamilyQuestion(
      demoSeedIds.familyId,
      mayaId,
      demoSeedIds.rosaPersonId,
      '  How did you meet Grandpa?  ',
    );
    const child = familyQuestions.queueFamilyQuestion(
      demoSeedIds.familyId,
      childId,
      demoSeedIds.rosaPersonId,
      'What games did you play?',
    );

    expect(relative.status).toBe('queued');
    expect(child.status).toBe('queued');
    expect(
      queueRepository.findQuestion(demoSeedIds.familyId, relative.queuedQuestionId),
    ).toMatchObject({
      fromDisplayName: 'Maya',
      questionText: 'How did you meet Grandpa?',
      status: 'queued',
    });
  });

  it('rejects invalid roles, targets, family scope, and text', () => {
    const otherFamily = addFamily('Other Family', 'Other Narrator');
    const inactiveNarrator = addMember(demoSeedIds.familyId, 'Inactive', 'narrator', 'inactive');

    const attempts = [
      () =>
        familyQuestions.queueFamilyQuestion(
          demoSeedIds.familyId,
          demoSeedIds.rosaPersonId,
          childId,
          'A question',
        ),
      () =>
        familyQuestions.queueFamilyQuestion(demoSeedIds.familyId, mayaId, childId, 'A question'),
      () =>
        familyQuestions.queueFamilyQuestion(
          demoSeedIds.familyId,
          otherFamily.personId,
          demoSeedIds.rosaPersonId,
          'A question',
        ),
      () =>
        familyQuestions.queueFamilyQuestion(
          demoSeedIds.familyId,
          mayaId,
          otherFamily.personId,
          'A question',
        ),
      () =>
        familyQuestions.queueFamilyQuestion(
          demoSeedIds.familyId,
          mayaId,
          inactiveNarrator,
          'A question',
        ),
    ];
    for (const attempt of attempts) {
      expectStoryError(attempt, ['QUESTION_SENDER_NOT_ALLOWED', 'QUESTION_TARGET_NOT_NARRATOR']);
    }
    expect(() =>
      familyQuestions.queueFamilyQuestion(
        demoSeedIds.familyId,
        mayaId,
        demoSeedIds.rosaPersonId,
        '   ',
      ),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'QUESTION_TEXT_INVALID' }),
    );
    expect(() =>
      familyQuestions.queueFamilyQuestion(
        demoSeedIds.familyId,
        mayaId,
        demoSeedIds.rosaPersonId,
        'x'.repeat(501),
      ),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'QUESTION_TEXT_INVALID' }),
    );
  });

  it('keeps an already-presented question stable, then surfaces one durable family question once', () => {
    const started = interviewService.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    const queued = familyQuestions.queueFamilyQuestion(
      demoSeedIds.familyId,
      mayaId,
      demoSeedIds.rosaPersonId,
      'How did you meet Grandpa?',
    );

    expect(
      interviewService.getNextQuestion(demoSeedIds.familyId, started.interviewId).questionId,
    ).toBe(started.questionId);
    interviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      'The street was quiet.',
    );

    const surfaced = interviewService.getNextQuestion(demoSeedIds.familyId, started.interviewId);
    const repeated = interviewService.getNextQuestion(demoSeedIds.familyId, started.interviewId);
    expect(surfaced.questionText).toBe(
      'Maya left you a question. They asked: “How did you meet Grandpa?”',
    );
    expect(repeated).toEqual(surfaced);
    const askedQueue = queueRepository.findQuestion(demoSeedIds.familyId, queued.queuedQuestionId);
    expect(askedQueue).toMatchObject({
      status: 'asked',
      answeredAt: null,
    });
    expect(askedQueue?.askedAt).toBeInstanceOf(Date);
    expect(
      database.client
        .prepare('SELECT count(*) AS count FROM questions WHERE source_reference_id = ?')
        .get(`family_queue:${queued.queuedQuestionId}`),
    ).toEqual({ count: 1 });
  });

  it('rolls back queued to asked when interview-question creation fails', () => {
    const started = interviewService.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    const queued = familyQuestions.queueFamilyQuestion(
      demoSeedIds.familyId,
      mayaId,
      demoSeedIds.rosaPersonId,
      'What was your first school like?',
    );
    interviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      'Initial answer.',
    );
    database.client.exec(`
      CREATE TRIGGER reject_family_question_insert
      BEFORE INSERT ON questions
      WHEN NEW.source = 'family_queue'
      BEGIN
        SELECT RAISE(ABORT, 'test question insert failure');
      END;
    `);

    expect(() =>
      interviewService.getNextQuestion(demoSeedIds.familyId, started.interviewId),
    ).toThrow('test question insert failure');
    expect(
      queueRepository.findQuestion(demoSeedIds.familyId, queued.queuedQuestionId),
    ).toMatchObject({
      status: 'queued',
      askedAt: null,
    });
    expect(
      database.client
        .prepare("SELECT count(*) AS count FROM questions WHERE source = 'family_queue'")
        .get(),
    ).toEqual({ count: 0 });
  });

  it('moves queued to asked to answered atomically with answer and extraction job', () => {
    const started = interviewService.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    const queued = familyQuestions.queueFamilyQuestion(
      demoSeedIds.familyId,
      mayaId,
      demoSeedIds.rosaPersonId,
      'How did you meet Grandpa?',
    );
    interviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      'First answer.',
    );
    const surfaced = interviewService.getNextQuestion(demoSeedIds.familyId, started.interviewId);
    if (surfaced.questionId === null) throw new Error('Expected a surfaced family question.');
    const surfacedQuestionId = surfaced.questionId;
    const answer = interviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      surfacedQuestionId,
      'We met at the railway station.',
    );

    const answeredQueue = queueRepository.findQuestion(
      demoSeedIds.familyId,
      queued.queuedQuestionId,
    );
    expect(answeredQueue).toMatchObject({
      status: 'answered',
    });
    expect(answeredQueue?.askedAt).toBeInstanceOf(Date);
    expect(answeredQueue?.answeredAt).toBeInstanceOf(Date);
    expect(
      database.client.prepare('SELECT raw_text FROM answers WHERE id = ?').get(answer.answerId),
    ).toEqual({ raw_text: 'We met at the railway station.' });
    expect(
      database.client
        .prepare("SELECT count(*) AS count FROM jobs WHERE payload = ? AND status = 'queued'")
        .get(JSON.stringify({ answerId: answer.answerId })),
    ).toEqual({ count: 1 });
    expect(() =>
      interviewService.saveAnswer(
        demoSeedIds.familyId,
        started.interviewId,
        surfacedQuestionId,
        'A duplicate.',
      ),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'QUESTION_ALREADY_ANSWERED' }),
    );
  });

  it('rolls back answer, job, and question changes if the queue answer transition fails', () => {
    const started = interviewService.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    const queued = familyQuestions.queueFamilyQuestion(
      demoSeedIds.familyId,
      mayaId,
      demoSeedIds.rosaPersonId,
      'What was the journey like?',
    );
    interviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      'Initial answer.',
    );
    const surfaced = interviewService.getNextQuestion(demoSeedIds.familyId, started.interviewId);
    if (surfaced.questionId === null) throw new Error('Expected a surfaced family question.');
    const jobsBefore = database.client.prepare('SELECT count(*) AS count FROM jobs').get();
    database.client.exec(`
      CREATE TRIGGER reject_queue_answer
      BEFORE UPDATE OF status ON queued_questions
      WHEN NEW.status = 'answered'
      BEGIN
        SELECT RAISE(ABORT, 'test queue transition failure');
      END;
    `);

    expect(() =>
      interviewService.saveAnswer(
        demoSeedIds.familyId,
        started.interviewId,
        surfaced.questionId ?? '',
        'This must roll back.',
      ),
    ).toThrow('test queue transition failure');
    expect(database.client.prepare('SELECT count(*) AS count FROM jobs').get()).toEqual(jobsBefore);
    expect(
      database.client
        .prepare('SELECT count(*) AS count FROM answers WHERE question_id = ?')
        .get(surfaced.questionId),
    ).toEqual({ count: 0 });
    expect(
      database.client.prepare('SELECT status FROM questions WHERE id = ?').get(surfaced.questionId),
    ).toEqual({
      status: 'asked',
    });
    expect(
      queueRepository.findQuestion(demoSeedIds.familyId, queued.queuedQuestionId)?.status,
    ).toBe('asked');
  });

  it('orders contradictions before family questions and queues before memory/fallback prompts', () => {
    const started = interviewService.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    const firstAnswerId = interviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      'I remember both 1962 and 1964.',
    ).answerId;
    const left = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1962',
      confidence: 0.9,
      answerId: firstAnswerId,
    }).fact;
    const right = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1964',
      confidence: 0.9,
      answerId: firstAnswerId,
    }).fact;
    memory.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });
    familyQuestions.queueFamilyQuestion(
      demoSeedIds.familyId,
      mayaId,
      demoSeedIds.rosaPersonId,
      'What happened next?',
    );

    const next = interviewService.getNextQuestion(demoSeedIds.familyId, started.interviewId);
    expect(next.questionText).toContain('I remember you mentioning both');
    expect(database.client.prepare('SELECT status FROM queued_questions LIMIT 1').get()).toEqual({
      status: 'queued',
    });
  });

  it('uses deterministic oldest-first ordering and does not leak queue state into story context', () => {
    const started = interviewService.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    const first = queueRepository.queueQuestion({
      familyId: demoSeedIds.familyId,
      fromPersonId: mayaId,
      toPersonId: demoSeedIds.rosaPersonId,
      questionText: 'Oldest question?',
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    queueRepository.queueQuestion({
      familyId: demoSeedIds.familyId,
      fromPersonId: childId,
      toPersonId: demoSeedIds.rosaPersonId,
      questionText: 'Newer question?',
      createdAt: new Date('2020-01-02T00:00:00.000Z'),
    });
    interviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      'Initial answer.',
    );

    const surfacedFirst = interviewService.getNextQuestion(
      demoSeedIds.familyId,
      started.interviewId,
    );
    expect(surfacedFirst.questionText).toContain('Oldest question?');
    expect(queueRepository.findQuestion(demoSeedIds.familyId, first.id)?.status).toBe('asked');
    if (surfacedFirst.questionId === null) throw new Error('Expected the oldest family question.');
    interviewService.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      surfacedFirst.questionId,
      'An answer to the oldest question.',
    );
    expect(
      interviewService.getNextQuestion(demoSeedIds.familyId, started.interviewId).questionText,
    ).toContain('Newer question?');
    const relativeContext = privacy.getStoryContext(demoSeedIds.familyId, mayaId);
    expect(Object.keys(relativeContext)).toEqual([
      'actor',
      'visibility',
      'personIdentities',
      'facts',
      'relationships',
      'timelineEvents',
      'chapters',
      'conflicts',
    ]);
    expect(relativeContext.visibility).toBe('approved_family');
  });

  function addMember(
    familyId: string,
    displayName: string,
    role: 'narrator' | 'relative' | 'child',
    status: 'active' | 'inactive' = 'active',
  ): string {
    const personId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.people)
      .values({
        id: personId,
        familyId,
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
        familyId,
        personId,
        role,
        status,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return personId;
  }

  function expectStoryError(operation: () => unknown, expectedCodes: readonly string[]): void {
    try {
      operation();
      throw new Error('Expected a StoryKeeperError.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(StoryKeeperError);
      if (!(error instanceof StoryKeeperError)) throw error;
      expect(expectedCodes).toContain(error.code);
    }
  }

  function addFamily(displayName: string, narratorName: string) {
    const familyId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.families)
      .values({ id: familyId, displayName, createdAt: now, updatedAt: now })
      .run();
    return { familyId, personId: addMember(familyId, narratorName, 'narrator') };
  }
});
