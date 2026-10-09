import { randomUUID } from 'node:crypto';

import { and, asc, eq, or } from 'drizzle-orm';
import type {
  ChapterDraftStatus,
  ChapterGeneration,
  ChapterGenerationRequest,
  ChapterGenerationSource,
  ChapterSourceReference,
} from '@story-keeper/shared';

import type { StoryKeeperDatabase } from './database.js';
import {
  chapterDrafts,
  chapterSources,
  contradictions,
  facts,
  familyMemberships,
  jobs,
  people,
  personCandidates,
  relationships,
  timelineEvents,
} from './schema.js';

export const minimumChapterSourceCount = 2;

export interface RequestChapterDraftInput {
  readonly familyId: string;
  readonly actorPersonId: string;
  readonly narratorPersonId: string;
  readonly chapterTopic: string;
  readonly maxAttempts: number;
  readonly requestedAt?: Date;
}

export type RequestChapterDraftRecord =
  | {
      readonly status: 'queued';
      readonly chapterDraftId: string;
      readonly jobId: string;
      readonly sourceCount: number;
    }
  | {
      readonly status: 'insufficient_sources';
      readonly chapterDraftId: null;
      readonly jobId: null;
      readonly sourceCount: number;
    };

export interface ChapterSourceRecord extends ChapterSourceReference {
  readonly label: string;
  readonly summary: string;
}

export interface ChapterDraftRecord {
  readonly id: string;
  readonly familyId: string;
  readonly narratorPersonId: string;
  readonly requestedTopic: string;
  readonly title: string | null;
  readonly body: string | null;
  readonly status: ChapterDraftStatus;
  readonly generationJobId: string;
  readonly reviewedByPersonId: string | null;
  readonly reviewedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly sources: readonly ChapterSourceRecord[];
}

export interface PublishChapterDraftInput {
  readonly familyId: string;
  readonly chapterDraftId: string;
  readonly jobId: string;
  readonly workerId: string;
  readonly allowedSources: readonly ChapterSourceReference[];
  readonly chapter: ChapterGeneration;
  readonly publishedAt?: Date;
}

export type ChapterRepositoryErrorCode =
  | 'CHAPTER_ACTOR_NOT_AUTHORIZED'
  | 'CHAPTER_NOT_FOUND'
  | 'CHAPTER_SOURCE_NOT_ELIGIBLE'
  | 'CHAPTER_STATE_CONFLICT';

export class ChapterRepositoryError extends Error {
  public constructor(
    public readonly code: ChapterRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChapterRepositoryError';
  }
}

export class DrizzleChapterRepository {
  public constructor(private readonly database: StoryKeeperDatabase) {}

  public requestDraft(input: RequestChapterDraftInput): RequestChapterDraftRecord {
    const topic = input.chapterTopic.trim();
    if (topic.length === 0 || topic.length > 200) {
      throw new ChapterRepositoryError(
        'CHAPTER_STATE_CONFLICT',
        'The chapter topic must contain between 1 and 200 characters.',
      );
    }

    return this.database.db.transaction((transaction) => {
      requireNarratorOwner(
        transaction,
        input.familyId,
        input.actorPersonId,
        input.narratorPersonId,
      );
      const sources = selectEligibleSources(transaction, input.familyId, input.narratorPersonId);
      if (sources.length < minimumChapterSourceCount) {
        return {
          status: 'insufficient_sources',
          chapterDraftId: null,
          jobId: null,
          sourceCount: sources.length,
        };
      }

      const chapterDraftId = randomUUID();
      const jobId = randomUUID();
      const requestedAt = input.requestedAt ?? new Date();
      const sourceReferences = sources.map(({ type, id }) => ({ type, id }));
      transaction
        .insert(jobs)
        .values({
          id: jobId,
          familyId: input.familyId,
          type: 'draft_chapter',
          payload: JSON.stringify({ chapterDraftId, sources: sourceReferences }),
          deduplicationKey: `draft_chapter:${chapterDraftId}`,
          status: 'queued',
          attemptCount: 0,
          maxAttempts: input.maxAttempts,
          availableAt: requestedAt,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        })
        .run();
      transaction
        .insert(chapterDrafts)
        .values({
          id: chapterDraftId,
          familyId: input.familyId,
          narratorPersonId: input.narratorPersonId,
          requestedTopic: topic,
          title: null,
          body: null,
          status: 'generating',
          generationJobId: jobId,
          reviewedByPersonId: null,
          reviewedAt: null,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        })
        .run();

      return { status: 'queued', chapterDraftId, jobId, sourceCount: sources.length };
    });
  }

  public loadGenerationRequest(
    familyId: string,
    chapterDraftId: string,
    jobId: string,
    sourceReferences: readonly ChapterSourceReference[],
  ): ChapterGenerationRequest | undefined {
    const draft = this.database.db
      .select({
        id: chapterDrafts.id,
        familyId: chapterDrafts.familyId,
        narratorPersonId: chapterDrafts.narratorPersonId,
        topic: chapterDrafts.requestedTopic,
        status: chapterDrafts.status,
        generationJobId: chapterDrafts.generationJobId,
        narratorName: people.canonicalDisplayName,
      })
      .from(chapterDrafts)
      .innerJoin(
        people,
        and(
          eq(people.familyId, chapterDrafts.familyId),
          eq(people.id, chapterDrafts.narratorPersonId),
        ),
      )
      .where(and(eq(chapterDrafts.familyId, familyId), eq(chapterDrafts.id, chapterDraftId)))
      .limit(1)
      .get();
    if (draft === undefined || draft.status !== 'generating' || draft.generationJobId !== jobId) {
      return undefined;
    }
    const sources = selectEligibleSources(this.database.db, familyId, draft.narratorPersonId);
    const selected = resolveSelectedSources(sources, sourceReferences);
    return {
      chapterDraftId,
      topic: draft.topic,
      narrator: { id: draft.narratorPersonId, displayName: draft.narratorName },
      sources: [...selected],
    };
  }

  public publishDraft(input: PublishChapterDraftInput): 'succeeded' | 'already_succeeded' {
    return this.database.db.transaction((transaction) => {
      const draft = transaction
        .select()
        .from(chapterDrafts)
        .where(
          and(
            eq(chapterDrafts.familyId, input.familyId),
            eq(chapterDrafts.id, input.chapterDraftId),
            eq(chapterDrafts.generationJobId, input.jobId),
          ),
        )
        .limit(1)
        .get();
      const job = transaction
        .select()
        .from(jobs)
        .where(and(eq(jobs.familyId, input.familyId), eq(jobs.id, input.jobId)))
        .limit(1)
        .get();
      if (draft === undefined || job === undefined) throw chapterNotFound();
      if (job.status === 'succeeded' && draft.status !== 'generating') return 'already_succeeded';
      if (
        draft.status !== 'generating' ||
        job.status !== 'running' ||
        job.lockedBy !== input.workerId
      ) {
        throw new ChapterRepositoryError(
          'CHAPTER_STATE_CONFLICT',
          'The chapter generation job is not in the required state.',
        );
      }

      const eligible = selectEligibleSources(transaction, input.familyId, draft.narratorPersonId);
      const allowed = resolveSelectedSources(eligible, input.allowedSources);
      const used = resolveSelectedSources(allowed, input.chapter.usedSources);
      const publishedAt = input.publishedAt ?? new Date();

      for (const source of used) {
        transaction
          .insert(chapterSources)
          .values({
            id: randomUUID(),
            familyId: input.familyId,
            chapterDraftId: input.chapterDraftId,
            sourceType: source.type,
            sourceId: source.id,
            sourceLabel: source.label,
            sourceSummary: source.content,
            createdAt: publishedAt,
          })
          .run();
      }
      const draftUpdate = transaction
        .update(chapterDrafts)
        .set({
          title: input.chapter.title,
          body: input.chapter.body,
          status: 'pending_review',
          updatedAt: publishedAt,
        })
        .where(
          and(
            eq(chapterDrafts.familyId, input.familyId),
            eq(chapterDrafts.id, input.chapterDraftId),
            eq(chapterDrafts.status, 'generating'),
          ),
        )
        .run();
      const jobUpdate = transaction
        .update(jobs)
        .set({
          status: 'succeeded',
          lockedAt: null,
          lockedBy: null,
          completedAt: publishedAt,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: publishedAt,
        })
        .where(
          and(
            eq(jobs.familyId, input.familyId),
            eq(jobs.id, input.jobId),
            eq(jobs.status, 'running'),
            eq(jobs.lockedBy, input.workerId),
          ),
        )
        .run();
      if (draftUpdate.changes !== 1 || jobUpdate.changes !== 1) {
        throw new ChapterRepositoryError(
          'CHAPTER_STATE_CONFLICT',
          'The chapter publication state changed before it could be committed.',
        );
      }
      return 'succeeded';
    });
  }

  public markFailed(familyId: string, chapterDraftId: string, jobId: string, now: Date): void {
    this.database.db
      .update(chapterDrafts)
      .set({ status: 'failed', updatedAt: now })
      .where(
        and(
          eq(chapterDrafts.familyId, familyId),
          eq(chapterDrafts.id, chapterDraftId),
          eq(chapterDrafts.generationJobId, jobId),
          eq(chapterDrafts.status, 'generating'),
        ),
      )
      .run();
  }

  public reviewDraft(
    familyId: string,
    actorPersonId: string,
    chapterDraftId: string,
  ): ChapterDraftRecord {
    const draft = this.database.db
      .select()
      .from(chapterDrafts)
      .where(and(eq(chapterDrafts.familyId, familyId), eq(chapterDrafts.id, chapterDraftId)))
      .limit(1)
      .get();
    if (draft === undefined) throw chapterNotFound();
    requireNarratorOwner(this.database.db, familyId, actorPersonId, draft.narratorPersonId);
    const sources = this.database.db
      .select()
      .from(chapterSources)
      .where(
        and(
          eq(chapterSources.familyId, familyId),
          eq(chapterSources.chapterDraftId, chapterDraftId),
        ),
      )
      .orderBy(asc(chapterSources.sourceType), asc(chapterSources.sourceId))
      .all();
    return {
      id: draft.id,
      familyId: draft.familyId,
      narratorPersonId: draft.narratorPersonId,
      requestedTopic: draft.requestedTopic,
      title: draft.title,
      body: draft.body,
      status: draft.status,
      generationJobId: draft.generationJobId,
      reviewedByPersonId: draft.reviewedByPersonId,
      reviewedAt: draft.reviewedAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      sources: sources.map((source) => ({
        type: source.sourceType,
        id: source.sourceId,
        label: source.sourceLabel,
        summary: source.sourceSummary,
      })),
    };
  }
}

type QueryExecutor = StoryKeeperDatabase['db'] | Transaction;
type Transaction = Parameters<Parameters<StoryKeeperDatabase['db']['transaction']>[0]>[0];

function requireNarratorOwner(
  executor: QueryExecutor,
  familyId: string,
  actorPersonId: string,
  narratorPersonId: string,
): void {
  if (actorPersonId !== narratorPersonId) throw chapterActorNotAuthorized();
  const actor = executor
    .select({ id: people.id })
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
        eq(people.id, actorPersonId),
        eq(people.status, 'active'),
        eq(familyMemberships.status, 'active'),
        eq(familyMemberships.role, 'narrator'),
      ),
    )
    .limit(1)
    .get();
  if (actor === undefined) throw chapterActorNotAuthorized();
}

function selectEligibleSources(
  executor: QueryExecutor,
  familyId: string,
  narratorPersonId: string,
): readonly ChapterGenerationSource[] {
  const unresolved = executor
    .select({
      leftFactId: contradictions.leftFactId,
      rightFactId: contradictions.rightFactId,
      leftTimelineEventId: contradictions.leftTimelineEventId,
      rightTimelineEventId: contradictions.rightTimelineEventId,
    })
    .from(contradictions)
    .where(and(eq(contradictions.familyId, familyId), eq(contradictions.status, 'unresolved')))
    .all();
  const excludedFactIds = new Set(
    unresolved.flatMap((row) => [row.leftFactId, row.rightFactId]).filter(isString),
  );
  const excludedEventIds = new Set(
    unresolved
      .flatMap((row) => [row.leftTimelineEventId, row.rightTimelineEventId])
      .filter(isString),
  );

  const factRecords = executor
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.familyId, familyId),
        eq(facts.subjectPersonId, narratorPersonId),
        eq(facts.approvalStatus, 'approved'),
      ),
    )
    .orderBy(asc(facts.createdAt), asc(facts.id))
    .all()
    .filter((fact) => !excludedFactIds.has(fact.id))
    .map((fact): ChapterGenerationSource => ({
      type: 'fact',
      id: fact.id,
      label: bounded(`${humanize(fact.factType)}: ${fact.normalizedValue}`, 300),
      content: bounded(`${humanize(fact.factType)}: ${fact.normalizedValue}`, 2_000),
    }));

  const activePeople = new Map(
    executor
      .select({ id: people.id, displayName: people.canonicalDisplayName })
      .from(people)
      .where(and(eq(people.familyId, familyId), eq(people.status, 'active')))
      .all()
      .map((person) => [person.id, person.displayName]),
  );
  const unresolvedPeople = new Set(
    executor
      .select({ id: personCandidates.candidatePersonId })
      .from(personCandidates)
      .where(
        and(eq(personCandidates.familyId, familyId), eq(personCandidates.status, 'unresolved')),
      )
      .all()
      .map(({ id }) => id),
  );
  const relationshipRecords = executor
    .select()
    .from(relationships)
    .where(
      and(
        eq(relationships.familyId, familyId),
        eq(relationships.approvalStatus, 'approved'),
        or(
          eq(relationships.fromPersonId, narratorPersonId),
          eq(relationships.toPersonId, narratorPersonId),
        ),
      ),
    )
    .orderBy(asc(relationships.createdAt), asc(relationships.id))
    .all()
    .flatMap((relationship): readonly ChapterGenerationSource[] => {
      const fromName = activePeople.get(relationship.fromPersonId);
      const toName = activePeople.get(relationship.toPersonId);
      if (
        fromName === undefined ||
        toName === undefined ||
        unresolvedPeople.has(relationship.fromPersonId) ||
        unresolvedPeople.has(relationship.toPersonId)
      ) {
        return [];
      }
      const summary = `${fromName} is recorded as ${humanize(relationship.relationshipType)} of ${toName}.`;
      return [
        {
          type: 'relationship',
          id: relationship.id,
          label: bounded(
            `${fromName} — ${humanize(relationship.relationshipType)} — ${toName}`,
            300,
          ),
          content: bounded(summary, 2_000),
        },
      ];
    });

  const timelineRecords = executor
    .select()
    .from(timelineEvents)
    .where(
      and(
        eq(timelineEvents.familyId, familyId),
        eq(timelineEvents.subjectPersonId, narratorPersonId),
        eq(timelineEvents.approvalStatus, 'approved'),
      ),
    )
    .orderBy(
      asc(timelineEvents.earliestYear),
      asc(timelineEvents.createdAt),
      asc(timelineEvents.id),
    )
    .all()
    .filter((event) => !excludedEventIds.has(event.id))
    .map((event): ChapterGenerationSource => ({
      type: 'timeline_event',
      id: event.id,
      label: bounded(event.title, 300),
      content: bounded(
        `${event.title}. ${event.description} Date: ${formatDate(event.earliestYear, event.latestYear, event.datePrecision)}.`,
        2_000,
      ),
    }));

  return [...factRecords, ...relationshipRecords, ...timelineRecords];
}

function resolveSelectedSources(
  eligible: readonly ChapterGenerationSource[],
  selected: readonly ChapterSourceReference[],
): readonly ChapterGenerationSource[] {
  const byKey = new Map(eligible.map((source) => [sourceKey(source), source]));
  const resolved = selected.map((reference) => byKey.get(sourceKey(reference)));
  if (resolved.some((source) => source === undefined)) {
    throw new ChapterRepositoryError(
      'CHAPTER_SOURCE_NOT_ELIGIBLE',
      'A selected chapter source is no longer approved and eligible.',
    );
  }
  return resolved.filter((source): source is ChapterGenerationSource => source !== undefined);
}

function sourceKey(source: ChapterSourceReference): string {
  return `${source.type}:${source.id}`;
}

function isString(value: string | null): value is string {
  return value !== null;
}

function bounded(value: string, maximum: number): string {
  const trimmed = value.trim();
  return trimmed.length <= maximum ? trimmed : trimmed.slice(0, maximum).trimEnd();
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').trim();
}

function formatDate(
  earliestYear: number | null,
  latestYear: number | null,
  precision: 'exact' | 'approximate' | 'range' | 'unknown',
): string {
  if (precision === 'unknown' || earliestYear === null || latestYear === null) return 'unknown';
  if (precision === 'exact') return String(earliestYear);
  if (precision === 'approximate' && earliestYear === latestYear) {
    return `around ${String(earliestYear)}`;
  }
  return `${precision === 'approximate' ? 'around ' : ''}${String(earliestYear)}–${String(latestYear)}`;
}

function chapterActorNotAuthorized(): ChapterRepositoryError {
  return new ChapterRepositoryError(
    'CHAPTER_ACTOR_NOT_AUTHORIZED',
    'Only the active narrator may access this chapter draft.',
  );
}

function chapterNotFound(): ChapterRepositoryError {
  return new ChapterRepositoryError(
    'CHAPTER_NOT_FOUND',
    'The chapter draft was not found in this family.',
  );
}
