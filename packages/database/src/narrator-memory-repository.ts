import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type {
  ApproximateDate,
  ContradictionResolutionType,
  StoryItemStatus,
} from '@story-keeper/shared';

import type { StoryKeeperDatabase } from './database.js';
import {
  answers,
  contradictions,
  facts,
  factSources,
  people,
  personCandidates,
  questions,
  timelineEvents,
  timelineEventSources,
} from './schema.js';

export interface FactConflictClaimRecord {
  readonly kind: 'fact';
  readonly itemId: string;
  readonly subjectPersonId: string;
  readonly factType: string;
  readonly value: string;
  readonly status: StoryItemStatus;
  readonly sourceAnswerIds: readonly string[];
}

export interface TimelineConflictClaimRecord {
  readonly kind: 'timeline_event';
  readonly itemId: string;
  readonly subjectPersonId: string;
  readonly eventType: string;
  readonly title: string;
  readonly description: string;
  readonly date: ApproximateDate;
  readonly status: StoryItemStatus;
  readonly sourceAnswerIds: readonly string[];
}

export type ConflictClaimRecord = FactConflictClaimRecord | TimelineConflictClaimRecord;

export interface NarratorConflictRecord {
  readonly id: string;
  readonly type: 'fact_value' | 'timeline_date';
  readonly status: 'unresolved' | 'resolved' | 'dismissed';
  readonly resolutionType: ContradictionResolutionType | null;
  readonly resolvedByPersonId: string | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
  readonly left: ConflictClaimRecord;
  readonly right: ConflictClaimRecord;
}

export interface PersonClarificationRecord {
  readonly id: string;
  readonly extractedName: string;
  readonly possibleMatchName: string | null;
  readonly createdAt: Date;
}

export interface TimelinePlanningRecord {
  readonly id: string;
  readonly eventType: string;
  readonly title: string;
  readonly description: string;
  readonly date: ApproximateDate;
  readonly createdAt: Date;
}

export interface ResolveConflictInput {
  readonly familyId: string;
  readonly narratorPersonId: string;
  readonly contradictionId: string;
  readonly resolutionType: ContradictionResolutionType;
  readonly resolvedAt?: Date;
}

export interface ResolveConflictRecord {
  readonly contradictionId: string;
  readonly status: 'resolved' | 'dismissed' | 'already_resolved';
  readonly resolutionType: ContradictionResolutionType;
  readonly resolvedByPersonId: string;
  readonly resolvedAt: Date;
}

export type NarratorMemoryRepositoryErrorCode =
  'CONTRADICTION_NOT_FOUND' | 'CONFLICT_ALREADY_RESOLVED' | 'INVALID_CONFLICT_RESOLUTION';

export class NarratorMemoryRepositoryError extends Error {
  public constructor(
    public readonly code: NarratorMemoryRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NarratorMemoryRepositoryError';
  }
}

export interface NarratorMemoryRepository {
  listPendingConflicts(
    familyId: string,
    narratorPersonId: string,
  ): readonly NarratorConflictRecord[];
  resolveConflict(input: ResolveConflictInput): ResolveConflictRecord;
  listUnresolvedPersonCandidates(
    familyId: string,
    narratorPersonId: string,
  ): readonly PersonClarificationRecord[];
  listTimelinePlanningCandidates(
    familyId: string,
    narratorPersonId: string,
  ): readonly TimelinePlanningRecord[];
}

export class DrizzleNarratorMemoryRepository implements NarratorMemoryRepository {
  public constructor(private readonly database: StoryKeeperDatabase) {}

  public listPendingConflicts(
    familyId: string,
    narratorPersonId: string,
  ): readonly NarratorConflictRecord[] {
    const rows = this.database.db
      .select()
      .from(contradictions)
      .where(and(eq(contradictions.familyId, familyId), eq(contradictions.status, 'unresolved')))
      .orderBy(asc(contradictions.createdAt), asc(contradictions.id))
      .all();

    return rows.flatMap((row) => {
      const record = this.hydrateConflict(familyId, narratorPersonId, row);
      return record === undefined ? [] : [record];
    });
  }

  public resolveConflict(input: ResolveConflictInput): ResolveConflictRecord {
    return this.database.db.transaction((transaction) => {
      const contradiction = transaction
        .select()
        .from(contradictions)
        .where(
          and(
            eq(contradictions.familyId, input.familyId),
            eq(contradictions.id, input.contradictionId),
          ),
        )
        .limit(1)
        .get();
      if (contradiction === undefined) throw contradictionNotFound();

      const isRelevant = (() => {
        if (contradiction.contradictionType === 'fact_value') {
          if (contradiction.leftFactId === null || contradiction.rightFactId === null) return false;
          const belongsToNarrator = (factId: string): boolean =>
            transaction
              .select({ id: facts.id })
              .from(facts)
              .innerJoin(
                factSources,
                and(eq(factSources.familyId, facts.familyId), eq(factSources.factId, facts.id)),
              )
              .innerJoin(
                answers,
                and(
                  eq(answers.familyId, factSources.familyId),
                  eq(answers.id, factSources.answerId),
                ),
              )
              .where(
                and(
                  eq(facts.familyId, input.familyId),
                  eq(facts.id, factId),
                  eq(facts.subjectPersonId, input.narratorPersonId),
                  eq(answers.narratorPersonId, input.narratorPersonId),
                ),
              )
              .limit(1)
              .get() !== undefined;
          return (
            belongsToNarrator(contradiction.leftFactId) &&
            belongsToNarrator(contradiction.rightFactId)
          );
        }
        if (
          contradiction.leftTimelineEventId === null ||
          contradiction.rightTimelineEventId === null
        ) {
          return false;
        }
        const belongsToNarrator = (eventId: string): boolean =>
          transaction
            .select({ id: timelineEvents.id })
            .from(timelineEvents)
            .innerJoin(
              timelineEventSources,
              and(
                eq(timelineEventSources.familyId, timelineEvents.familyId),
                eq(timelineEventSources.timelineEventId, timelineEvents.id),
              ),
            )
            .innerJoin(
              answers,
              and(
                eq(answers.familyId, timelineEventSources.familyId),
                eq(answers.id, timelineEventSources.answerId),
              ),
            )
            .where(
              and(
                eq(timelineEvents.familyId, input.familyId),
                eq(timelineEvents.id, eventId),
                eq(timelineEvents.subjectPersonId, input.narratorPersonId),
                eq(answers.narratorPersonId, input.narratorPersonId),
              ),
            )
            .limit(1)
            .get() !== undefined;
        return (
          belongsToNarrator(contradiction.leftTimelineEventId) &&
          belongsToNarrator(contradiction.rightTimelineEventId)
        );
      })();
      if (!isRelevant) throw contradictionNotFound();

      if (contradiction.status !== 'unresolved') {
        if (
          contradiction.resolutionType === input.resolutionType &&
          contradiction.resolvedByPersonId === input.narratorPersonId &&
          contradiction.resolvedAt !== null
        ) {
          return {
            contradictionId: contradiction.id,
            status: 'already_resolved',
            resolutionType: input.resolutionType,
            resolvedByPersonId: input.narratorPersonId,
            resolvedAt: contradiction.resolvedAt,
          };
        }
        throw new NarratorMemoryRepositoryError(
          'CONFLICT_ALREADY_RESOLVED',
          'The contradiction has already been resolved differently.',
        );
      }

      const hasActiveClaims =
        contradiction.contradictionType === 'fact_value'
          ? contradiction.leftFactId !== null &&
            contradiction.rightFactId !== null &&
            transaction
              .select({ id: facts.id })
              .from(facts)
              .where(
                and(
                  eq(facts.familyId, input.familyId),
                  inArray(facts.id, [contradiction.leftFactId, contradiction.rightFactId]),
                  ne(facts.approvalStatus, 'rejected'),
                ),
              )
              .all().length === 2
          : contradiction.leftTimelineEventId !== null &&
            contradiction.rightTimelineEventId !== null &&
            transaction
              .select({ id: timelineEvents.id })
              .from(timelineEvents)
              .where(
                and(
                  eq(timelineEvents.familyId, input.familyId),
                  inArray(timelineEvents.id, [
                    contradiction.leftTimelineEventId,
                    contradiction.rightTimelineEventId,
                  ]),
                  ne(timelineEvents.approvalStatus, 'rejected'),
                ),
              )
              .all().length === 2;
      if (!hasActiveClaims) throw contradictionNotFound();

      if (
        input.resolutionType === 'different_events' &&
        contradiction.contradictionType !== 'timeline_date'
      ) {
        throw new NarratorMemoryRepositoryError(
          'INVALID_CONFLICT_RESOLUTION',
          'different_events is only valid for timeline contradictions.',
        );
      }

      const resolvedAt = input.resolvedAt ?? new Date();
      if (input.resolutionType === 'keep_left' || input.resolutionType === 'keep_right') {
        const losingId =
          input.resolutionType === 'keep_left'
            ? contradiction.contradictionType === 'fact_value'
              ? contradiction.rightFactId
              : contradiction.rightTimelineEventId
            : contradiction.contradictionType === 'fact_value'
              ? contradiction.leftFactId
              : contradiction.leftTimelineEventId;
        if (losingId === null) throw contradictionNotFound();
        if (contradiction.contradictionType === 'fact_value') {
          transaction
            .update(facts)
            .set({ approvalStatus: 'rejected', updatedAt: resolvedAt })
            .where(
              and(
                eq(facts.familyId, input.familyId),
                eq(facts.id, losingId),
                eq(facts.approvalStatus, 'pending'),
              ),
            )
            .run();
        } else {
          transaction
            .update(timelineEvents)
            .set({ approvalStatus: 'rejected', updatedAt: resolvedAt })
            .where(
              and(
                eq(timelineEvents.familyId, input.familyId),
                eq(timelineEvents.id, losingId),
                eq(timelineEvents.approvalStatus, 'pending'),
              ),
            )
            .run();
        }
      }

      const status =
        input.resolutionType === 'dismiss_not_a_conflict'
          ? ('dismissed' as const)
          : ('resolved' as const);
      const update = transaction
        .update(contradictions)
        .set({
          status,
          resolutionType: input.resolutionType,
          resolvedByPersonId: input.narratorPersonId,
          resolvedAt,
          updatedAt: resolvedAt,
        })
        .where(
          and(
            eq(contradictions.familyId, input.familyId),
            eq(contradictions.id, input.contradictionId),
            eq(contradictions.status, 'unresolved'),
          ),
        )
        .run();
      if (update.changes !== 1) {
        throw new NarratorMemoryRepositoryError(
          'CONFLICT_ALREADY_RESOLVED',
          'The contradiction changed before this resolution was saved.',
        );
      }

      transaction
        .update(questions)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(questions.familyId, input.familyId),
            eq(questions.sourceReferenceId, `contradiction:${input.contradictionId}`),
            eq(questions.status, 'asked'),
          ),
        )
        .run();

      return {
        contradictionId: input.contradictionId,
        status,
        resolutionType: input.resolutionType,
        resolvedByPersonId: input.narratorPersonId,
        resolvedAt,
      };
    });
  }

  public listUnresolvedPersonCandidates(
    familyId: string,
    narratorPersonId: string,
  ): readonly PersonClarificationRecord[] {
    return this.database.db
      .select({
        id: personCandidates.id,
        extractedName: personCandidates.extractedName,
        possibleMatchPersonId: personCandidates.possibleMatchPersonId,
        createdAt: personCandidates.createdAt,
      })
      .from(personCandidates)
      .innerJoin(
        answers,
        and(
          eq(answers.familyId, personCandidates.familyId),
          eq(answers.id, personCandidates.answerId),
        ),
      )
      .where(
        and(
          eq(personCandidates.familyId, familyId),
          eq(personCandidates.status, 'unresolved'),
          eq(answers.narratorPersonId, narratorPersonId),
        ),
      )
      .orderBy(asc(personCandidates.createdAt), asc(personCandidates.id))
      .all()
      .map((candidate) => ({
        id: candidate.id,
        extractedName: candidate.extractedName,
        possibleMatchName:
          candidate.possibleMatchPersonId === null
            ? null
            : (this.database.db
                .select({ name: people.canonicalDisplayName })
                .from(people)
                .where(
                  and(
                    eq(people.familyId, familyId),
                    eq(people.id, candidate.possibleMatchPersonId),
                  ),
                )
                .limit(1)
                .get()?.name ?? null),
        createdAt: candidate.createdAt,
      }));
  }

  public listTimelinePlanningCandidates(
    familyId: string,
    narratorPersonId: string,
  ): readonly TimelinePlanningRecord[] {
    return this.database.db
      .select()
      .from(timelineEvents)
      .where(
        and(
          eq(timelineEvents.familyId, familyId),
          eq(timelineEvents.subjectPersonId, narratorPersonId),
          eq(timelineEvents.approvalStatus, 'pending'),
        ),
      )
      .orderBy(asc(timelineEvents.createdAt), asc(timelineEvents.id))
      .all()
      .filter(
        (event) =>
          this.database.db
            .select({ answerId: timelineEventSources.answerId })
            .from(timelineEventSources)
            .innerJoin(
              answers,
              and(
                eq(answers.familyId, timelineEventSources.familyId),
                eq(answers.id, timelineEventSources.answerId),
              ),
            )
            .where(
              and(
                eq(timelineEventSources.familyId, familyId),
                eq(timelineEventSources.timelineEventId, event.id),
                eq(answers.narratorPersonId, narratorPersonId),
              ),
            )
            .limit(1)
            .get() !== undefined,
      )
      .map((event) => ({
        id: event.id,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        date: {
          earliestYear: event.earliestYear,
          latestYear: event.latestYear,
          precision: event.datePrecision,
        },
        createdAt: event.createdAt,
      }));
  }

  private hydrateConflict(
    familyId: string,
    narratorPersonId: string,
    row: typeof contradictions.$inferSelect,
  ): NarratorConflictRecord | undefined {
    if (row.contradictionType === 'fact_value') {
      if (row.leftFactId === null || row.rightFactId === null) return undefined;
      const left = this.loadFactClaim(familyId, narratorPersonId, row.leftFactId);
      const right = this.loadFactClaim(familyId, narratorPersonId, row.rightFactId);
      if (left === undefined || right === undefined) return undefined;
      return {
        id: row.id,
        type: row.contradictionType,
        status: row.status,
        resolutionType: row.resolutionType,
        resolvedByPersonId: row.resolvedByPersonId,
        resolvedAt: row.resolvedAt,
        createdAt: row.createdAt,
        left,
        right,
      };
    }
    if (row.leftTimelineEventId === null || row.rightTimelineEventId === null) return undefined;
    const left = this.loadTimelineClaim(familyId, narratorPersonId, row.leftTimelineEventId);
    const right = this.loadTimelineClaim(familyId, narratorPersonId, row.rightTimelineEventId);
    if (left === undefined || right === undefined) return undefined;
    return {
      id: row.id,
      type: row.contradictionType,
      status: row.status,
      resolutionType: row.resolutionType,
      resolvedByPersonId: row.resolvedByPersonId,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
      left,
      right,
    };
  }

  private loadFactClaim(
    familyId: string,
    narratorPersonId: string,
    factId: string,
  ): FactConflictClaimRecord | undefined {
    const fact = this.database.db
      .select()
      .from(facts)
      .where(
        and(
          eq(facts.familyId, familyId),
          eq(facts.id, factId),
          eq(facts.subjectPersonId, narratorPersonId),
          ne(facts.approvalStatus, 'rejected'),
        ),
      )
      .limit(1)
      .get();
    if (fact === undefined) return undefined;
    const sourceAnswerIds = this.database.db
      .select({ answerId: factSources.answerId })
      .from(factSources)
      .innerJoin(
        answers,
        and(eq(answers.familyId, factSources.familyId), eq(answers.id, factSources.answerId)),
      )
      .where(
        and(
          eq(factSources.familyId, familyId),
          eq(factSources.factId, factId),
          eq(answers.narratorPersonId, narratorPersonId),
        ),
      )
      .orderBy(asc(factSources.createdAt), asc(factSources.id))
      .all()
      .map(({ answerId }) => answerId);
    if (sourceAnswerIds.length === 0) return undefined;
    return {
      kind: 'fact',
      itemId: fact.id,
      subjectPersonId: fact.subjectPersonId,
      factType: fact.factType,
      value: fact.normalizedValue,
      status: fact.approvalStatus,
      sourceAnswerIds,
    };
  }

  private loadTimelineClaim(
    familyId: string,
    narratorPersonId: string,
    eventId: string,
  ): TimelineConflictClaimRecord | undefined {
    const event = this.database.db
      .select()
      .from(timelineEvents)
      .where(
        and(
          eq(timelineEvents.familyId, familyId),
          eq(timelineEvents.id, eventId),
          eq(timelineEvents.subjectPersonId, narratorPersonId),
          ne(timelineEvents.approvalStatus, 'rejected'),
        ),
      )
      .limit(1)
      .get();
    if (event === undefined) return undefined;
    const sourceAnswerIds = this.database.db
      .select({ answerId: timelineEventSources.answerId })
      .from(timelineEventSources)
      .innerJoin(
        answers,
        and(
          eq(answers.familyId, timelineEventSources.familyId),
          eq(answers.id, timelineEventSources.answerId),
        ),
      )
      .where(
        and(
          eq(timelineEventSources.familyId, familyId),
          eq(timelineEventSources.timelineEventId, eventId),
          eq(answers.narratorPersonId, narratorPersonId),
        ),
      )
      .orderBy(asc(timelineEventSources.createdAt), asc(timelineEventSources.id))
      .all()
      .map(({ answerId }) => answerId);
    if (sourceAnswerIds.length === 0) return undefined;
    return {
      kind: 'timeline_event',
      itemId: event.id,
      subjectPersonId: event.subjectPersonId,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      date: {
        earliestYear: event.earliestYear,
        latestYear: event.latestYear,
        precision: event.datePrecision,
      },
      status: event.approvalStatus,
      sourceAnswerIds,
    };
  }
}

function contradictionNotFound(): NarratorMemoryRepositoryError {
  return new NarratorMemoryRepositoryError(
    'CONTRADICTION_NOT_FOUND',
    'The contradiction was not found for this narrator.',
  );
}
