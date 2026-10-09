import type {
  FamilyMemberRecord,
  InterviewRecord,
  InterviewRepository,
  QuestionRecord,
} from '@story-keeper/database';
import { maximumRawAnswerLength } from '@story-keeper/shared';

import { StoryKeeperError } from './errors.js';
import type { FamilyQuestionService } from './family-question-service.js';
import { phaseOneQuestionBank } from './question-bank.js';
import type { NarratorMemoryService } from './narrator-memory-service.js';

export interface StartInterviewResult {
  readonly interviewId: string;
  readonly narrator: {
    readonly id: string;
    readonly displayName: string;
  };
  readonly questionId: string;
  readonly questionText: string;
}

export interface SaveAnswerResult {
  readonly answerId: string;
  readonly status: 'saved';
}

export interface GetNextQuestionResult {
  readonly status: 'question' | 'complete';
  readonly interviewId: string;
  readonly questionId: string | null;
  readonly questionText: string | null;
}

export class InterviewService {
  public constructor(
    private readonly repository: InterviewRepository,
    private readonly narratorMemory?: NarratorMemoryService,
    private readonly familyQuestions?: FamilyQuestionService,
  ) {}

  public startInterview(familyId: string, personId: string): StartInterviewResult {
    const narrator = this.getNarrator(familyId, personId);
    let interview =
      this.repository.findActiveInterview(familyId, personId) ??
      this.repository.createInterview(familyId, personId);
    let question = this.getOrCreateQuestion(interview);

    if (question === undefined) {
      this.repository.completeInterview(familyId, interview.id);
      interview = this.repository.createInterview(familyId, personId);
      question = this.getOrCreateQuestion(interview);
      if (question === undefined) {
        throw new Error('The interview planner must provide at least one question.');
      }
    }

    return this.toStartResult(interview, narrator, question);
  }

  public saveAnswer(
    familyId: string,
    interviewId: string,
    questionId: string,
    rawText: string,
  ): SaveAnswerResult {
    if (rawText.trim().length === 0 || rawText.length > maximumRawAnswerLength) {
      throw new StoryKeeperError(
        'ANSWER_TEXT_INVALID',
        `The answer must contain text and be at most ${String(maximumRawAnswerLength)} characters.`,
      );
    }
    const interview = this.getInterview(familyId, interviewId);
    const question = this.repository.findQuestion(familyId, interviewId, questionId);

    if (question === undefined) {
      throw new StoryKeeperError(
        'QUESTION_NOT_IN_INTERVIEW',
        'The question does not belong to this interview.',
      );
    }

    if (question.status === 'superseded') {
      throw new StoryKeeperError(
        'QUESTION_NOT_ACTIVE',
        'The question is no longer active for this interview.',
      );
    }

    if (this.repository.findAnswerByQuestion(familyId, interviewId, questionId) !== undefined) {
      throw new StoryKeeperError(
        'QUESTION_ALREADY_ANSWERED',
        'The question already has an answer.',
      );
    }

    const answer = this.repository.createAnswer({
      familyId,
      interviewId,
      questionId,
      narratorPersonId: interview.narratorPersonId,
      rawText,
    });

    return { answerId: answer.id, status: 'saved' };
  }

  public getNextQuestion(familyId: string, interviewId: string): GetNextQuestionResult {
    const interview = this.getInterview(familyId, interviewId);

    if (interview.status === 'completed') {
      return { status: 'complete', interviewId, questionId: null, questionText: null };
    }

    const question = this.getOrCreateQuestion(interview);
    if (question === undefined) {
      this.repository.completeInterview(familyId, interviewId);
      return { status: 'complete', interviewId, questionId: null, questionText: null };
    }

    return {
      status: 'question',
      interviewId,
      questionId: question.id,
      questionText: question.text,
    };
  }

  private getNarrator(familyId: string, personId: string): FamilyMemberRecord {
    if (!this.repository.familyExists(familyId)) {
      throw new StoryKeeperError('FAMILY_NOT_FOUND', 'The family was not found.');
    }

    const narrator = this.repository.findActiveFamilyMember(familyId, personId);
    if (narrator === undefined) {
      throw new StoryKeeperError(
        'PERSON_NOT_IN_FAMILY',
        'The person is not an active member of this family.',
      );
    }

    return narrator;
  }

  private getInterview(familyId: string, interviewId: string): InterviewRecord {
    const interview = this.repository.findInterview(familyId, interviewId);
    if (interview === undefined) {
      throw new StoryKeeperError('INTERVIEW_NOT_FOUND', 'The interview was not found.');
    }

    return interview;
  }

  private getOrCreateQuestion(interview: InterviewRecord): QuestionRecord | undefined {
    const unanswered = this.repository.findUnansweredQuestion(interview.familyId, interview.id);
    if (unanswered !== undefined) {
      return unanswered;
    }

    const usedKeys = new Set(
      this.repository.listQuestionSourceReferences(interview.familyId, interview.id),
    );
    const contradiction = this.narratorMemory?.planContradictionQuestion(interview, usedKeys);
    if (contradiction !== undefined) {
      return this.createPlannedQuestion(interview, contradiction);
    }

    const familyQuestion = this.familyQuestions?.planNextQuestion(interview);
    if (familyQuestion !== undefined && !usedKeys.has(familyQuestion.sourceReferenceId)) {
      return this.repository.createFamilyQuestion({
        familyId: interview.familyId,
        interviewId: interview.id,
        narratorPersonId: interview.narratorPersonId,
        queuedQuestionId: familyQuestion.queuedQuestionId,
        text: familyQuestion.text,
      });
    }

    const memoryQuestion = this.narratorMemory?.planMemoryQuestion(interview, usedKeys);
    if (memoryQuestion !== undefined) {
      return this.createPlannedQuestion(interview, memoryQuestion);
    }
    const next = phaseOneQuestionBank.find((question) => !usedKeys.has(question.key));

    return next === undefined
      ? undefined
      : this.repository.createQuestion({
          familyId: interview.familyId,
          interviewId: interview.id,
          text: next.text,
          sourceReferenceId: next.key,
        });
  }

  private createPlannedQuestion(
    interview: InterviewRecord,
    planned: NonNullable<ReturnType<NarratorMemoryService['planNextQuestion']>>,
  ): QuestionRecord {
    return this.repository.createQuestion({
      familyId: interview.familyId,
      interviewId: interview.id,
      text: planned.text,
      type: planned.type,
      source: planned.source,
      sourceReferenceId: planned.sourceReferenceId,
    });
  }

  private toStartResult(
    interview: InterviewRecord,
    narrator: FamilyMemberRecord,
    question: QuestionRecord,
  ): StartInterviewResult {
    return {
      interviewId: interview.id,
      narrator: {
        id: narrator.id,
        displayName: narrator.displayName,
      },
      questionId: question.id,
      questionText: question.text,
    };
  }
}
