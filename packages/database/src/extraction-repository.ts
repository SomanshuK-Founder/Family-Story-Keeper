import { and, asc, eq } from 'drizzle-orm';
import type {
  ApproximateDate,
  RelationshipType,
  StoryExtractionRequest,
} from '@story-keeper/shared';

import type { StoryKeeperDatabase } from './database.js';
import {
  answers,
  contradictions,
  facts,
  factSources,
  jobs,
  people,
  personCandidates,
  questions,
  relationships,
  relationshipSources,
  timelineEvents,
  timelineEventSources,
} from './schema.js';

export interface ExtractionContextRecord {
  readonly familyId: string;
  readonly request: StoryExtractionRequest;
}

export interface PublishPersonCandidate {
  readonly id: string;
  readonly personId: string;
  readonly displayName: string;
  readonly confidence: number;
  readonly possibleMatchPersonId: string | null;
  readonly matchScore: number | null;
}

export interface PublishFact {
  readonly id: string;
  readonly sourceId: string;
  readonly subjectPersonId: string;
  readonly factType: string;
  readonly normalizedValue: string;
  readonly confidence: number;
  readonly sourceLocator: string | null;
}

export interface PublishRelationship {
  readonly id: string;
  readonly sourceId: string;
  readonly fromPersonId: string;
  readonly toPersonId: string;
  readonly relationshipType: RelationshipType;
  readonly confidence: number;
}

export interface PublishTimelineEvent {
  readonly id: string;
  readonly sourceId: string;
  readonly subjectPersonId: string;
  readonly eventType: string;
  readonly title: string;
  readonly description: string;
  readonly date: ApproximateDate;
}

export type PublishContradiction =
  | {
      readonly id: string;
      readonly type: 'fact_value';
      readonly leftFactId: string;
      readonly rightFactId: string;
    }
  | {
      readonly id: string;
      readonly type: 'timeline_date';
      readonly leftTimelineEventId: string;
      readonly rightTimelineEventId: string;
    };

export interface PublishExtractionInput {
  readonly jobId: string;
  readonly workerId: string;
  readonly familyId: string;
  readonly answerId: string;
  readonly people: readonly PublishPersonCandidate[];
  readonly facts: readonly PublishFact[];
  readonly relationships: readonly PublishRelationship[];
  readonly events: readonly PublishTimelineEvent[];
  readonly contradictions: readonly PublishContradiction[];
}

export type PublishExtractionResult = 'published' | 'already_succeeded';

export interface PersonCandidateRecord {
  readonly id: string;
  readonly candidatePersonId: string;
  readonly extractedName: string;
  readonly status: 'unresolved' | 'matched' | 'dismissed';
  readonly possibleMatchPersonId: string | null;
  readonly matchScore: number | null;
}

export class ExtractionRepositoryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ExtractionRepositoryError';
  }
}

export class DrizzleExtractionRepository {
  public constructor(private readonly database: StoryKeeperDatabase) {}

  public loadContext(
    familyId: string,
    answerId: string,
    peopleLimit = 20,
  ): ExtractionContextRecord | undefined {
    const answer = this.database.db
      .select({
        answerId: answers.id,
        rawAnswer: answers.rawText,
        narratorId: answers.narratorPersonId,
        narratorName: people.canonicalDisplayName,
        questionId: questions.id,
        questionText: questions.text,
      })
      .from(answers)
      .innerJoin(
        people,
        and(eq(people.familyId, answers.familyId), eq(people.id, answers.narratorPersonId)),
      )
      .innerJoin(
        questions,
        and(
          eq(questions.familyId, answers.familyId),
          eq(questions.interviewSessionId, answers.interviewSessionId),
          eq(questions.id, answers.questionId),
        ),
      )
      .where(and(eq(answers.familyId, familyId), eq(answers.id, answerId)))
      .limit(1)
      .get();
    if (answer === undefined) return undefined;

    const knownPeople = this.database.db
      .select({ id: people.id, displayName: people.canonicalDisplayName })
      .from(people)
      .where(and(eq(people.familyId, familyId), eq(people.status, 'active')))
      .orderBy(asc(people.createdAt), asc(people.id))
      .limit(peopleLimit)
      .all()
      .map(({ id, displayName }) => ({ reference: `person:${id}`, id, displayName }));

    return {
      familyId,
      request: {
        answerId: answer.answerId,
        rawAnswer: answer.rawAnswer,
        narrator: {
          reference: 'narrator',
          id: answer.narratorId,
          displayName: answer.narratorName,
        },
        question: { id: answer.questionId, text: answer.questionText },
        knownPeople,
      },
    };
  }

  public publishExtraction(input: PublishExtractionInput): PublishExtractionResult {
    return this.database.db.transaction((transaction) => {
      const job = transaction
        .select({ status: jobs.status, lockedBy: jobs.lockedBy })
        .from(jobs)
        .where(and(eq(jobs.familyId, input.familyId), eq(jobs.id, input.jobId)))
        .limit(1)
        .get();
      if (job?.status === 'succeeded') return 'already_succeeded';
      if (job?.status !== 'running' || job.lockedBy !== input.workerId) {
        throw new ExtractionRepositoryError('The extraction job is not held by this worker.');
      }

      const sourceAnswer = transaction
        .select({ id: answers.id })
        .from(answers)
        .where(and(eq(answers.familyId, input.familyId), eq(answers.id, input.answerId)))
        .limit(1)
        .get();
      if (sourceAnswer === undefined) {
        throw new ExtractionRepositoryError('The extraction source answer is unavailable.');
      }

      const now = new Date();
      if (input.people.length > 0) {
        transaction
          .insert(people)
          .values(
            input.people.map((candidate) => ({
              id: candidate.personId,
              familyId: input.familyId,
              canonicalDisplayName: candidate.displayName,
              status: 'inactive' as const,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .run();
        transaction
          .insert(personCandidates)
          .values(
            input.people.map((candidate) => ({
              id: candidate.id,
              familyId: input.familyId,
              candidatePersonId: candidate.personId,
              answerId: input.answerId,
              jobId: input.jobId,
              extractedName: candidate.displayName,
              confidence: candidate.confidence,
              status: 'unresolved' as const,
              possibleMatchPersonId: candidate.possibleMatchPersonId,
              matchScore: candidate.matchScore,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .run();
      }

      for (const fact of input.facts) {
        transaction
          .insert(facts)
          .values({
            id: fact.id,
            familyId: input.familyId,
            subjectPersonId: fact.subjectPersonId,
            factType: fact.factType,
            normalizedValue: fact.normalizedValue,
            confidence: fact.confidence,
            approvalStatus: 'pending',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        transaction
          .insert(factSources)
          .values({
            id: fact.sourceId,
            familyId: input.familyId,
            factId: fact.id,
            answerId: input.answerId,
            sourceLocator: fact.sourceLocator,
            createdAt: now,
          })
          .run();
      }

      for (const relationship of input.relationships) {
        transaction
          .insert(relationships)
          .values({
            id: relationship.id,
            familyId: input.familyId,
            fromPersonId: relationship.fromPersonId,
            toPersonId: relationship.toPersonId,
            relationshipType: relationship.relationshipType,
            confidence: relationship.confidence,
            approvalStatus: 'pending',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        transaction
          .insert(relationshipSources)
          .values({
            id: relationship.sourceId,
            familyId: input.familyId,
            relationshipId: relationship.id,
            answerId: input.answerId,
            jobId: input.jobId,
            createdAt: now,
          })
          .run();
      }

      for (const event of input.events) {
        transaction
          .insert(timelineEvents)
          .values({
            id: event.id,
            familyId: input.familyId,
            subjectPersonId: event.subjectPersonId,
            eventType: event.eventType,
            title: event.title,
            description: event.description,
            earliestYear: event.date.earliestYear,
            latestYear: event.date.latestYear,
            datePrecision: event.date.precision,
            approvalStatus: 'pending',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        transaction
          .insert(timelineEventSources)
          .values({
            id: event.sourceId,
            familyId: input.familyId,
            timelineEventId: event.id,
            answerId: input.answerId,
            jobId: input.jobId,
            createdAt: now,
          })
          .run();
      }

      for (const contradiction of input.contradictions) {
        transaction
          .insert(contradictions)
          .values({
            id: contradiction.id,
            familyId: input.familyId,
            contradictionType: contradiction.type,
            leftFactId: contradiction.type === 'fact_value' ? contradiction.leftFactId : null,
            rightFactId: contradiction.type === 'fact_value' ? contradiction.rightFactId : null,
            leftTimelineEventId:
              contradiction.type === 'timeline_date' ? contradiction.leftTimelineEventId : null,
            rightTimelineEventId:
              contradiction.type === 'timeline_date' ? contradiction.rightTimelineEventId : null,
            status: 'unresolved',
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .run();
      }

      const completed = transaction
        .update(jobs)
        .set({
          status: 'succeeded',
          lockedAt: null,
          lockedBy: null,
          completedAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobs.id, input.jobId),
            eq(jobs.familyId, input.familyId),
            eq(jobs.status, 'running'),
            eq(jobs.lockedBy, input.workerId),
          ),
        )
        .run();
      if (completed.changes !== 1) {
        throw new ExtractionRepositoryError('The extraction job lock changed during publishing.');
      }

      return 'published';
    });
  }

  public listPersonCandidates(familyId: string): readonly PersonCandidateRecord[] {
    return this.database.db
      .select()
      .from(personCandidates)
      .where(eq(personCandidates.familyId, familyId))
      .orderBy(asc(personCandidates.createdAt), asc(personCandidates.id))
      .all()
      .map((candidate) => ({
        id: candidate.id,
        candidatePersonId: candidate.candidatePersonId,
        extractedName: candidate.extractedName,
        status: candidate.status,
        possibleMatchPersonId: candidate.possibleMatchPersonId,
        matchScore: candidate.matchScore,
      }));
  }
}
