import { randomUUID } from 'node:crypto';

import {
  createDatabase,
  demoSeedIds,
  DrizzleInterviewRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
  seedDemoData,
} from '@story-keeper/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StoryKeeperError } from '../src/errors.js';
import { InterviewService } from '../src/interview-service.js';
import { phaseOneQuestionBank } from '../src/question-bank.js';

describe('InterviewService', () => {
  let database: ReturnType<typeof createDatabase>;
  let repository: DrizzleInterviewRepository;
  let service: InterviewService;

  beforeEach(() => {
    database = createDatabase(':memory:');
    runMigrations(database);
    seedDemoData(database);
    repository = new DrizzleInterviewRepository(database);
    service = new InterviewService(repository);
  });

  afterEach(() => {
    database.close();
  });

  it('creates and resumes one active interview with one persisted question', () => {
    const started = service.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    const resumed = service.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);

    expect(resumed).toEqual(started);
    expect(started.narrator).toEqual({ id: demoSeedIds.rosaPersonId, displayName: 'Rosa' });
    expect(started.questionText).toBe(phaseOneQuestionBank[0]?.text);
    expect(
      repository.listQuestionSourceReferences(demoSeedIds.familyId, started.interviewId),
    ).toEqual([phaseOneQuestionBank[0]?.key]);
  });

  it('preserves raw answer text exactly and advances deterministically', () => {
    const started = service.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    const rawText = '  We lived beside a bakery.\nThe street smelled like bread.  ';
    const saved = service.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      rawText,
    );
    const next = service.getNextQuestion(demoSeedIds.familyId, started.interviewId);

    expect(saved.status).toBe('saved');
    expect(
      repository.findAnswerByQuestion(
        demoSeedIds.familyId,
        started.interviewId,
        started.questionId,
      ),
    ).toEqual({ id: saved.answerId, rawText });
    expect(next).toMatchObject({
      status: 'question',
      interviewId: started.interviewId,
      questionText: phaseOneQuestionBank[1]?.text,
    });
  });

  it('does not create story memory automatically when an answer is saved', () => {
    const started = service.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    service.saveAnswer(
      demoSeedIds.familyId,
      started.interviewId,
      started.questionId,
      'We moved sometime in the early sixties.',
    );
    const memory = new DrizzleStoryMemoryRepository(database);

    expect(memory.listFacts(demoSeedIds.familyId)).toEqual([]);
    expect(memory.listRelationships(demoSeedIds.familyId)).toEqual([]);
    expect(memory.listTimelineEvents(demoSeedIds.familyId)).toEqual([]);
    expect(memory.listContradictions(demoSeedIds.familyId)).toEqual([]);
  });

  it('returns complete after every Phase 1 question is answered', () => {
    const started = service.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    let questionId = started.questionId;

    for (let index = 0; index < phaseOneQuestionBank.length; index += 1) {
      service.saveAnswer(
        demoSeedIds.familyId,
        started.interviewId,
        questionId,
        `Answer ${String(index + 1)}`,
      );
      const next = service.getNextQuestion(demoSeedIds.familyId, started.interviewId);

      if (index === phaseOneQuestionBank.length - 1) {
        expect(next).toEqual({
          status: 'complete',
          interviewId: started.interviewId,
          questionId: null,
          questionText: null,
        });
      } else {
        expect(next.status).toBe('question');
        if (next.status === 'question' && next.questionId !== null) questionId = next.questionId;
      }
    }
  });

  it('enforces family scope for people, interviews, and questions', () => {
    const started = service.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
    const otherFamilyId = randomUUID();

    expect(() => service.startInterview(otherFamilyId, demoSeedIds.rosaPersonId)).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'FAMILY_NOT_FOUND' }),
    );
    expect(() => service.startInterview(demoSeedIds.familyId, randomUUID())).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'PERSON_NOT_IN_FAMILY' }),
    );
    expect(() => service.getNextQuestion(otherFamilyId, started.interviewId)).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'INTERVIEW_NOT_FOUND' }),
    );
    expect(() =>
      service.saveAnswer(demoSeedIds.familyId, started.interviewId, randomUUID(), 'Valid text'),
    ).toThrow(
      expect.objectContaining<Partial<StoryKeeperError>>({ code: 'QUESTION_NOT_IN_INTERVIEW' }),
    );
  });
});
