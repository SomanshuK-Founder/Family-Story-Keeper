import { randomUUID } from 'node:crypto';

import { and, asc, eq, isNull } from 'drizzle-orm';

import type { StoryKeeperDatabase } from './database.js';
import {
  answers,
  families,
  familyMemberships,
  interviewSessions,
  jobs,
  people,
  queuedQuestions,
  questions,
} from './schema.js';

export interface FamilyMemberRecord {
  readonly id: string;
  readonly displayName: string;
  readonly role: 'narrator' | 'relative' | 'child';
}

export interface InterviewRecord {
  readonly id: string;
  readonly familyId: string;
  readonly narratorPersonId: string;
  readonly status: 'active' | 'completed';
}

export interface QuestionRecord {
  readonly id: string;
  readonly familyId: string;
  readonly interviewId: string;
  readonly text: string;
  readonly type:
    | 'phase_one_prompt'
    | 'contradiction_clarification'
    | 'family_question'
    | 'person_clarification'
    | 'memory_follow_up';
  readonly source: 'planner' | 'contradiction' | 'family_queue' | 'clarification' | 'follow_up';
  readonly sourceReferenceId: string | null;
  readonly status: 'asked' | 'answered' | 'superseded';
}

export interface AnswerRecord {
  readonly id: string;
  readonly rawText: string;
}

export interface CreateQuestionInput {
  readonly familyId: string;
  readonly interviewId: string;
  readonly text: string;
  readonly sourceReferenceId: string;
  readonly type?: QuestionRecord['type'];
  readonly source?: QuestionRecord['source'];
}

export interface CreateAnswerInput {
  readonly familyId: string;
  readonly interviewId: string;
  readonly questionId: string;
  readonly narratorPersonId: string;
  readonly rawText: string;
}

export interface CreateFamilyQuestionInput {
  readonly familyId: string;
  readonly interviewId: string;
  readonly narratorPersonId: string;
  readonly queuedQuestionId: string;
  readonly text: string;
}

export interface InterviewRepository {
  familyExists(familyId: string): boolean;
  findActiveFamilyMember(familyId: string, personId: string): FamilyMemberRecord | undefined;
  findActiveInterview(familyId: string, narratorPersonId: string): InterviewRecord | undefined;
  findInterview(familyId: string, interviewId: string): InterviewRecord | undefined;
  createInterview(familyId: string, narratorPersonId: string): InterviewRecord;
  findUnansweredQuestion(familyId: string, interviewId: string): QuestionRecord | undefined;
  findQuestion(
    familyId: string,
    interviewId: string,
    questionId: string,
  ): QuestionRecord | undefined;
  listQuestionSourceReferences(familyId: string, interviewId: string): readonly string[];
  createQuestion(input: CreateQuestionInput): QuestionRecord;
  createFamilyQuestion(input: CreateFamilyQuestionInput): QuestionRecord;
  createAnswer(input: CreateAnswerInput): AnswerRecord;
  findAnswerByQuestion(
    familyId: string,
    interviewId: string,
    questionId: string,
  ): AnswerRecord | undefined;
  completeInterview(familyId: string, interviewId: string): void;
}

export class DrizzleInterviewRepository implements InterviewRepository {
  public constructor(
    private readonly database: StoryKeeperDatabase,
    private readonly extractionJobMaxAttempts = 3,
  ) {}

  public familyExists(familyId: string): boolean {
    return (
      this.database.db
        .select({ id: families.id })
        .from(families)
        .where(eq(families.id, familyId))
        .limit(1)
        .get() !== undefined
    );
  }

  public findActiveFamilyMember(
    familyId: string,
    personId: string,
  ): FamilyMemberRecord | undefined {
    return this.database.db
      .select({
        id: people.id,
        displayName: people.canonicalDisplayName,
        role: familyMemberships.role,
      })
      .from(people)
      .innerJoin(
        familyMemberships,
        and(
          eq(familyMemberships.familyId, people.familyId),
          eq(familyMemberships.personId, people.id),
        ),
      )
      .where(
        and(
          eq(people.familyId, familyId),
          eq(people.id, personId),
          eq(people.status, 'active'),
          eq(familyMemberships.familyId, familyId),
          eq(familyMemberships.status, 'active'),
        ),
      )
      .limit(1)
      .get();
  }

  public findActiveInterview(
    familyId: string,
    narratorPersonId: string,
  ): InterviewRecord | undefined {
    return this.database.db
      .select({
        id: interviewSessions.id,
        familyId: interviewSessions.familyId,
        narratorPersonId: interviewSessions.narratorPersonId,
        status: interviewSessions.status,
      })
      .from(interviewSessions)
      .where(
        and(
          eq(interviewSessions.familyId, familyId),
          eq(interviewSessions.narratorPersonId, narratorPersonId),
          eq(interviewSessions.status, 'active'),
        ),
      )
      .limit(1)
      .get();
  }

  public findInterview(familyId: string, interviewId: string): InterviewRecord | undefined {
    return this.database.db
      .select({
        id: interviewSessions.id,
        familyId: interviewSessions.familyId,
        narratorPersonId: interviewSessions.narratorPersonId,
        status: interviewSessions.status,
      })
      .from(interviewSessions)
      .where(and(eq(interviewSessions.familyId, familyId), eq(interviewSessions.id, interviewId)))
      .limit(1)
      .get();
  }

  public createInterview(familyId: string, narratorPersonId: string): InterviewRecord {
    const id = randomUUID();
    const now = new Date();

    this.database.db
      .insert(interviewSessions)
      .values({
        id,
        familyId,
        narratorPersonId,
        status: 'active',
        startedAt: now,
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return { id, familyId, narratorPersonId, status: 'active' };
  }

  public findUnansweredQuestion(familyId: string, interviewId: string): QuestionRecord | undefined {
    return this.database.db
      .select({
        id: questions.id,
        familyId: questions.familyId,
        interviewId: questions.interviewSessionId,
        text: questions.text,
        type: questions.type,
        source: questions.source,
        sourceReferenceId: questions.sourceReferenceId,
        status: questions.status,
      })
      .from(questions)
      .leftJoin(
        answers,
        and(
          eq(answers.familyId, questions.familyId),
          eq(answers.interviewSessionId, questions.interviewSessionId),
          eq(answers.questionId, questions.id),
        ),
      )
      .where(
        and(
          eq(questions.familyId, familyId),
          eq(questions.interviewSessionId, interviewId),
          eq(questions.status, 'asked'),
          isNull(answers.id),
        ),
      )
      .orderBy(asc(questions.askedAt))
      .limit(1)
      .get();
  }

  public findQuestion(
    familyId: string,
    interviewId: string,
    questionId: string,
  ): QuestionRecord | undefined {
    return this.database.db
      .select({
        id: questions.id,
        familyId: questions.familyId,
        interviewId: questions.interviewSessionId,
        text: questions.text,
        type: questions.type,
        source: questions.source,
        sourceReferenceId: questions.sourceReferenceId,
        status: questions.status,
      })
      .from(questions)
      .where(
        and(
          eq(questions.familyId, familyId),
          eq(questions.interviewSessionId, interviewId),
          eq(questions.id, questionId),
        ),
      )
      .limit(1)
      .get();
  }

  public listQuestionSourceReferences(familyId: string, interviewId: string): readonly string[] {
    return this.database.db
      .select({ sourceReferenceId: questions.sourceReferenceId })
      .from(questions)
      .where(and(eq(questions.familyId, familyId), eq(questions.interviewSessionId, interviewId)))
      .all()
      .flatMap(({ sourceReferenceId }) => (sourceReferenceId === null ? [] : [sourceReferenceId]));
  }

  public createQuestion(input: CreateQuestionInput): QuestionRecord {
    const id = randomUUID();
    const now = new Date();

    this.database.db
      .insert(questions)
      .values({
        id,
        familyId: input.familyId,
        interviewSessionId: input.interviewId,
        type: input.type ?? 'phase_one_prompt',
        text: input.text,
        source: input.source ?? 'planner',
        sourceReferenceId: input.sourceReferenceId,
        status: 'asked',
        askedAt: now,
        createdAt: now,
      })
      .run();

    return {
      id,
      familyId: input.familyId,
      interviewId: input.interviewId,
      text: input.text,
      type: input.type ?? 'phase_one_prompt',
      source: input.source ?? 'planner',
      sourceReferenceId: input.sourceReferenceId,
      status: 'asked',
    };
  }

  public createFamilyQuestion(input: CreateFamilyQuestionInput): QuestionRecord {
    const sourceReferenceId = `family_queue:${input.queuedQuestionId}`;
    const existing = this.findQuestionBySourceReference(
      input.familyId,
      input.interviewId,
      sourceReferenceId,
    );
    if (existing !== undefined) return existing;

    const id = randomUUID();
    const now = new Date();
    return this.database.db.transaction((transaction) => {
      const queueUpdate = transaction
        .update(queuedQuestions)
        .set({ status: 'asked', askedAt: now })
        .where(
          and(
            eq(queuedQuestions.familyId, input.familyId),
            eq(queuedQuestions.id, input.queuedQuestionId),
            eq(queuedQuestions.toPersonId, input.narratorPersonId),
            eq(queuedQuestions.status, 'queued'),
          ),
        )
        .run();
      if (queueUpdate.changes !== 1) {
        throw new Error('The queued family question is no longer available.');
      }

      transaction
        .insert(questions)
        .values({
          id,
          familyId: input.familyId,
          interviewSessionId: input.interviewId,
          type: 'family_question',
          text: input.text,
          source: 'family_queue',
          sourceReferenceId,
          status: 'asked',
          askedAt: now,
          createdAt: now,
        })
        .run();

      return {
        id,
        familyId: input.familyId,
        interviewId: input.interviewId,
        text: input.text,
        type: 'family_question',
        source: 'family_queue',
        sourceReferenceId,
        status: 'asked',
      };
    });
  }

  public createAnswer(input: CreateAnswerInput): AnswerRecord {
    const id = randomUUID();
    const now = new Date();

    this.database.db.transaction((transaction) => {
      const question = transaction
        .select({ source: questions.source, sourceReferenceId: questions.sourceReferenceId })
        .from(questions)
        .where(
          and(
            eq(questions.familyId, input.familyId),
            eq(questions.interviewSessionId, input.interviewId),
            eq(questions.id, input.questionId),
          ),
        )
        .limit(1)
        .get();
      if (question === undefined) throw new Error('The interview question was not found.');

      transaction
        .insert(answers)
        .values({
          id,
          familyId: input.familyId,
          interviewSessionId: input.interviewId,
          questionId: input.questionId,
          narratorPersonId: input.narratorPersonId,
          rawText: input.rawText,
          createdAt: now,
        })
        .run();

      transaction
        .insert(jobs)
        .values({
          id: randomUUID(),
          familyId: input.familyId,
          type: 'extract_answer',
          payload: JSON.stringify({ answerId: id }),
          deduplicationKey: `extract_answer:${id}`,
          status: 'queued',
          attemptCount: 0,
          maxAttempts: this.extractionJobMaxAttempts,
          availableAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      transaction
        .update(questions)
        .set({ status: 'answered' })
        .where(
          and(
            eq(questions.familyId, input.familyId),
            eq(questions.interviewSessionId, input.interviewId),
            eq(questions.id, input.questionId),
          ),
        )
        .run();

      transaction
        .update(interviewSessions)
        .set({ lastActiveAt: now, updatedAt: now })
        .where(
          and(
            eq(interviewSessions.familyId, input.familyId),
            eq(interviewSessions.id, input.interviewId),
          ),
        )
        .run();

      if (question.source === 'family_queue') {
        const queuedQuestionId = parseFamilyQueueReference(question.sourceReferenceId);
        const queueUpdate = transaction
          .update(queuedQuestions)
          .set({ status: 'answered', answeredAt: now })
          .where(
            and(
              eq(queuedQuestions.familyId, input.familyId),
              eq(queuedQuestions.id, queuedQuestionId),
              eq(queuedQuestions.toPersonId, input.narratorPersonId),
              eq(queuedQuestions.status, 'asked'),
            ),
          )
          .run();
        if (queueUpdate.changes !== 1) {
          throw new Error('The queued family question is not awaiting an answer.');
        }
      }
    });

    return { id, rawText: input.rawText };
  }

  public findAnswerByQuestion(
    familyId: string,
    interviewId: string,
    questionId: string,
  ): AnswerRecord | undefined {
    return this.database.db
      .select({ id: answers.id, rawText: answers.rawText })
      .from(answers)
      .where(
        and(
          eq(answers.familyId, familyId),
          eq(answers.interviewSessionId, interviewId),
          eq(answers.questionId, questionId),
        ),
      )
      .limit(1)
      .get();
  }

  public completeInterview(familyId: string, interviewId: string): void {
    const now = new Date();
    this.database.db
      .update(interviewSessions)
      .set({ status: 'completed', lastActiveAt: now, updatedAt: now })
      .where(and(eq(interviewSessions.familyId, familyId), eq(interviewSessions.id, interviewId)))
      .run();
  }

  private findQuestionBySourceReference(
    familyId: string,
    interviewId: string,
    sourceReferenceId: string,
  ): QuestionRecord | undefined {
    return this.database.db
      .select({
        id: questions.id,
        familyId: questions.familyId,
        interviewId: questions.interviewSessionId,
        text: questions.text,
        type: questions.type,
        source: questions.source,
        sourceReferenceId: questions.sourceReferenceId,
        status: questions.status,
      })
      .from(questions)
      .where(
        and(
          eq(questions.familyId, familyId),
          eq(questions.interviewSessionId, interviewId),
          eq(questions.sourceReferenceId, sourceReferenceId),
        ),
      )
      .limit(1)
      .get();
  }
}

function parseFamilyQueueReference(sourceReferenceId: string | null): string {
  const prefix = 'family_queue:';
  if (sourceReferenceId === null || !sourceReferenceId.startsWith(prefix)) {
    throw new Error('The family question source reference is invalid.');
  }
  const queuedQuestionId = sourceReferenceId.slice(prefix.length);
  if (queuedQuestionId.length === 0) {
    throw new Error('The family question source reference is invalid.');
  }
  return queuedQuestionId;
}
