import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq } from 'drizzle-orm';
import type { QueuedQuestionStatus } from '@story-keeper/shared';

import type { StoryKeeperDatabase } from './database.js';
import { familyMemberships, people, queuedQuestions } from './schema.js';

export interface QueuedFamilyQuestionRecord {
  readonly id: string;
  readonly familyId: string;
  readonly fromPersonId: string;
  readonly fromDisplayName: string;
  readonly toPersonId: string;
  readonly questionText: string;
  readonly status: QueuedQuestionStatus;
  readonly priority: number;
  readonly createdAt: Date;
  readonly askedAt: Date | null;
  readonly answeredAt: Date | null;
}

export interface QueueFamilyQuestionInput {
  readonly familyId: string;
  readonly fromPersonId: string;
  readonly toPersonId: string;
  readonly questionText: string;
  readonly priority?: number;
  readonly createdAt?: Date;
}

export type FamilyQuestionRepositoryErrorCode =
  'QUESTION_SENDER_NOT_ALLOWED' | 'QUESTION_TARGET_NOT_NARRATOR' | 'QUESTION_TEXT_INVALID';

export class FamilyQuestionRepositoryError extends Error {
  public constructor(
    public readonly code: FamilyQuestionRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FamilyQuestionRepositoryError';
  }
}

export interface FamilyQuestionRepository {
  queueQuestion(input: QueueFamilyQuestionInput): QueuedFamilyQuestionRecord;
  findNextQueuedQuestion(
    familyId: string,
    narratorPersonId: string,
  ): QueuedFamilyQuestionRecord | undefined;
  findQuestion(familyId: string, queuedQuestionId: string): QueuedFamilyQuestionRecord | undefined;
}

export class DrizzleFamilyQuestionRepository implements FamilyQuestionRepository {
  public constructor(private readonly database: StoryKeeperDatabase) {}

  public queueQuestion(input: QueueFamilyQuestionInput): QueuedFamilyQuestionRecord {
    const questionText = input.questionText.trim();
    if (questionText.length === 0 || questionText.length > 500) {
      throw new FamilyQuestionRepositoryError(
        'QUESTION_TEXT_INVALID',
        'The family question must contain between 1 and 500 characters.',
      );
    }
    if (input.fromPersonId === input.toPersonId) {
      throw new FamilyQuestionRepositoryError(
        'QUESTION_SENDER_NOT_ALLOWED',
        'The sender must be a relative or child of the narrator.',
      );
    }

    const sender = this.findActiveMember(input.familyId, input.fromPersonId);
    if (sender === undefined || (sender.role !== 'relative' && sender.role !== 'child')) {
      throw new FamilyQuestionRepositoryError(
        'QUESTION_SENDER_NOT_ALLOWED',
        'Only an active relative or child may queue a family question.',
      );
    }
    const target = this.findActiveMember(input.familyId, input.toPersonId);
    if (target === undefined || target.role !== 'narrator') {
      throw new FamilyQuestionRepositoryError(
        'QUESTION_TARGET_NOT_NARRATOR',
        'The target must be an active narrator in the same family.',
      );
    }

    const id = randomUUID();
    const createdAt = input.createdAt ?? new Date();
    const priority = input.priority ?? 0;
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
      throw new FamilyQuestionRepositoryError(
        'QUESTION_TEXT_INVALID',
        'The family question priority is invalid.',
      );
    }

    this.database.db
      .insert(queuedQuestions)
      .values({
        id,
        familyId: input.familyId,
        fromPersonId: input.fromPersonId,
        toPersonId: input.toPersonId,
        questionText,
        status: 'queued',
        priority,
        createdAt,
      })
      .run();

    return {
      id,
      familyId: input.familyId,
      fromPersonId: input.fromPersonId,
      fromDisplayName: sender.displayName,
      toPersonId: input.toPersonId,
      questionText,
      status: 'queued',
      priority,
      createdAt,
      askedAt: null,
      answeredAt: null,
    };
  }

  public findNextQueuedQuestion(
    familyId: string,
    narratorPersonId: string,
  ): QueuedFamilyQuestionRecord | undefined {
    return this.selectRecords()
      .where(
        and(
          eq(queuedQuestions.familyId, familyId),
          eq(queuedQuestions.toPersonId, narratorPersonId),
          eq(queuedQuestions.status, 'queued'),
        ),
      )
      .orderBy(
        desc(queuedQuestions.priority),
        asc(queuedQuestions.createdAt),
        asc(queuedQuestions.id),
      )
      .limit(1)
      .get();
  }

  public findQuestion(
    familyId: string,
    queuedQuestionId: string,
  ): QueuedFamilyQuestionRecord | undefined {
    return this.selectRecords()
      .where(and(eq(queuedQuestions.familyId, familyId), eq(queuedQuestions.id, queuedQuestionId)))
      .limit(1)
      .get();
  }

  private findActiveMember(
    familyId: string,
    personId: string,
  ):
    { readonly displayName: string; readonly role: 'narrator' | 'relative' | 'child' } | undefined {
    return this.database.db
      .select({ displayName: people.canonicalDisplayName, role: familyMemberships.role })
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

  private selectRecords() {
    return this.database.db
      .select({
        id: queuedQuestions.id,
        familyId: queuedQuestions.familyId,
        fromPersonId: queuedQuestions.fromPersonId,
        fromDisplayName: people.canonicalDisplayName,
        toPersonId: queuedQuestions.toPersonId,
        questionText: queuedQuestions.questionText,
        status: queuedQuestions.status,
        priority: queuedQuestions.priority,
        createdAt: queuedQuestions.createdAt,
        askedAt: queuedQuestions.askedAt,
        answeredAt: queuedQuestions.answeredAt,
      })
      .from(queuedQuestions)
      .innerJoin(
        people,
        and(
          eq(people.familyId, queuedQuestions.familyId),
          eq(people.id, queuedQuestions.fromPersonId),
        ),
      );
  }
}
