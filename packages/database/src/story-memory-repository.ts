import { randomUUID } from 'node:crypto';

import {
  approximateDateSchema,
  relationshipTypeSchema,
  type ApproximateDate,
  type ContradictionStatus,
  type ContradictionType,
  type RelationshipType,
  type StoryItemStatus,
} from '@story-keeper/shared';
import { and, asc, eq } from 'drizzle-orm';

import type { StoryKeeperDatabase } from './database.js';
import {
  answers,
  contradictions,
  facts,
  factSources,
  people,
  relationships,
  timelineEvents,
} from './schema.js';

export type StoryMemoryRepositoryErrorCode =
  | 'PERSON_NOT_IN_FAMILY'
  | 'ANSWER_NOT_IN_FAMILY'
  | 'FACT_NOT_IN_FAMILY'
  | 'TIMELINE_EVENT_NOT_IN_FAMILY'
  | 'INVALID_CONFIDENCE';

export class StoryMemoryRepositoryError extends Error {
  public constructor(
    public readonly code: StoryMemoryRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoryMemoryRepositoryError';
  }
}

export interface FactRecord {
  readonly id: string;
  readonly familyId: string;
  readonly subjectPersonId: string;
  readonly factType: string;
  readonly normalizedValue: string;
  readonly confidence: number;
  readonly status: StoryItemStatus;
}

export interface FactSourceRecord {
  readonly id: string;
  readonly familyId: string;
  readonly factId: string;
  readonly answerId: string;
  readonly sourceLocator: string | null;
}

export interface CreateFactWithSourceInput {
  readonly familyId: string;
  readonly subjectPersonId: string;
  readonly factType: string;
  readonly normalizedValue: string;
  readonly confidence: number;
  readonly answerId: string;
  readonly sourceLocator?: string;
}

export interface FactWithSourceRecord {
  readonly fact: FactRecord;
  readonly source: FactSourceRecord;
}

export interface RelationshipRecord {
  readonly id: string;
  readonly familyId: string;
  readonly fromPersonId: string;
  readonly toPersonId: string;
  readonly relationshipType: RelationshipType;
  readonly confidence: number;
  readonly status: StoryItemStatus;
}

export interface CreateRelationshipInput {
  readonly familyId: string;
  readonly fromPersonId: string;
  readonly toPersonId: string;
  readonly relationshipType: string;
  readonly confidence: number;
}

export interface TimelineEventRecord {
  readonly id: string;
  readonly familyId: string;
  readonly subjectPersonId: string;
  readonly eventType: string;
  readonly title: string;
  readonly description: string;
  readonly date: ApproximateDate;
  readonly status: StoryItemStatus;
}

export interface CreateTimelineEventInput {
  readonly familyId: string;
  readonly subjectPersonId: string;
  readonly eventType: string;
  readonly title: string;
  readonly description: string;
  readonly date: ApproximateDate;
}

export type CreateContradictionInput =
  | {
      readonly familyId: string;
      readonly type: 'fact_value';
      readonly leftFactId: string;
      readonly rightFactId: string;
    }
  | {
      readonly familyId: string;
      readonly type: 'timeline_date';
      readonly leftTimelineEventId: string;
      readonly rightTimelineEventId: string;
    };

export interface ContradictionRecord {
  readonly id: string;
  readonly familyId: string;
  readonly type: ContradictionType;
  readonly leftFactId: string | null;
  readonly rightFactId: string | null;
  readonly leftTimelineEventId: string | null;
  readonly rightTimelineEventId: string | null;
  readonly status: ContradictionStatus;
}

export interface StoryMemoryRepository {
  createFactWithSource(input: CreateFactWithSourceInput): FactWithSourceRecord;
  findFact(familyId: string, factId: string): FactRecord | undefined;
  listFacts(familyId: string): readonly FactRecord[];
  listFactSources(familyId: string, factId: string): readonly FactSourceRecord[];
  createRelationship(input: CreateRelationshipInput): RelationshipRecord;
  findRelationship(familyId: string, relationshipId: string): RelationshipRecord | undefined;
  listRelationships(familyId: string): readonly RelationshipRecord[];
  createTimelineEvent(input: CreateTimelineEventInput): TimelineEventRecord;
  findTimelineEvent(familyId: string, eventId: string): TimelineEventRecord | undefined;
  listTimelineEvents(familyId: string): readonly TimelineEventRecord[];
  createContradiction(input: CreateContradictionInput): ContradictionRecord;
  findContradiction(familyId: string, contradictionId: string): ContradictionRecord | undefined;
  listContradictions(familyId: string): readonly ContradictionRecord[];
}

export class DrizzleStoryMemoryRepository implements StoryMemoryRepository {
  public constructor(private readonly database: StoryKeeperDatabase) {}

  public createFactWithSource(input: CreateFactWithSourceInput): FactWithSourceRecord {
    this.requirePerson(input.familyId, input.subjectPersonId);
    this.requireAnswer(input.familyId, input.answerId);
    requireConfidence(input.confidence);

    const factId = randomUUID();
    const sourceId = randomUUID();
    const now = new Date();

    this.database.db.transaction((transaction) => {
      transaction
        .insert(facts)
        .values({
          id: factId,
          familyId: input.familyId,
          subjectPersonId: input.subjectPersonId,
          factType: input.factType,
          normalizedValue: input.normalizedValue,
          confidence: input.confidence,
          approvalStatus: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      transaction
        .insert(factSources)
        .values({
          id: sourceId,
          familyId: input.familyId,
          factId,
          answerId: input.answerId,
          sourceLocator: input.sourceLocator ?? null,
          createdAt: now,
        })
        .run();
    });

    return {
      fact: {
        id: factId,
        familyId: input.familyId,
        subjectPersonId: input.subjectPersonId,
        factType: input.factType,
        normalizedValue: input.normalizedValue,
        confidence: input.confidence,
        status: 'pending',
      },
      source: {
        id: sourceId,
        familyId: input.familyId,
        factId,
        answerId: input.answerId,
        sourceLocator: input.sourceLocator ?? null,
      },
    };
  }

  public findFact(familyId: string, factId: string): FactRecord | undefined {
    const row = this.database.db
      .select()
      .from(facts)
      .where(and(eq(facts.familyId, familyId), eq(facts.id, factId)))
      .limit(1)
      .get();
    return row === undefined ? undefined : toFactRecord(row);
  }

  public listFacts(familyId: string): readonly FactRecord[] {
    return this.database.db
      .select()
      .from(facts)
      .where(eq(facts.familyId, familyId))
      .orderBy(asc(facts.createdAt), asc(facts.id))
      .all()
      .map(toFactRecord);
  }

  public listFactSources(familyId: string, factId: string): readonly FactSourceRecord[] {
    return this.database.db
      .select()
      .from(factSources)
      .where(and(eq(factSources.familyId, familyId), eq(factSources.factId, factId)))
      .orderBy(asc(factSources.createdAt), asc(factSources.id))
      .all()
      .map((row) => ({
        id: row.id,
        familyId: row.familyId,
        factId: row.factId,
        answerId: row.answerId,
        sourceLocator: row.sourceLocator,
      }));
  }

  public createRelationship(input: CreateRelationshipInput): RelationshipRecord {
    this.requirePerson(input.familyId, input.fromPersonId);
    this.requirePerson(input.familyId, input.toPersonId);
    const relationshipType = relationshipTypeSchema.parse(input.relationshipType);
    requireConfidence(input.confidence);

    const record: RelationshipRecord = {
      id: randomUUID(),
      familyId: input.familyId,
      fromPersonId: input.fromPersonId,
      toPersonId: input.toPersonId,
      relationshipType,
      confidence: input.confidence,
      status: 'pending',
    };
    const now = new Date();

    this.database.db
      .insert(relationships)
      .values({
        id: record.id,
        familyId: record.familyId,
        fromPersonId: record.fromPersonId,
        toPersonId: record.toPersonId,
        relationshipType: record.relationshipType,
        confidence: record.confidence,
        approvalStatus: record.status,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return record;
  }

  public findRelationship(
    familyId: string,
    relationshipId: string,
  ): RelationshipRecord | undefined {
    const row = this.database.db
      .select()
      .from(relationships)
      .where(and(eq(relationships.familyId, familyId), eq(relationships.id, relationshipId)))
      .limit(1)
      .get();
    return row === undefined ? undefined : toRelationshipRecord(row);
  }

  public listRelationships(familyId: string): readonly RelationshipRecord[] {
    return this.database.db
      .select()
      .from(relationships)
      .where(eq(relationships.familyId, familyId))
      .orderBy(asc(relationships.createdAt), asc(relationships.id))
      .all()
      .map(toRelationshipRecord);
  }

  public createTimelineEvent(input: CreateTimelineEventInput): TimelineEventRecord {
    this.requirePerson(input.familyId, input.subjectPersonId);
    const date = approximateDateSchema.parse(input.date);
    const record: TimelineEventRecord = {
      id: randomUUID(),
      familyId: input.familyId,
      subjectPersonId: input.subjectPersonId,
      eventType: input.eventType,
      title: input.title,
      description: input.description,
      date,
      status: 'pending',
    };
    const now = new Date();

    this.database.db
      .insert(timelineEvents)
      .values({
        id: record.id,
        familyId: record.familyId,
        subjectPersonId: record.subjectPersonId,
        eventType: record.eventType,
        title: record.title,
        description: record.description,
        earliestYear: record.date.earliestYear,
        latestYear: record.date.latestYear,
        datePrecision: record.date.precision,
        approvalStatus: record.status,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return record;
  }

  public findTimelineEvent(familyId: string, eventId: string): TimelineEventRecord | undefined {
    const row = this.database.db
      .select()
      .from(timelineEvents)
      .where(and(eq(timelineEvents.familyId, familyId), eq(timelineEvents.id, eventId)))
      .limit(1)
      .get();
    return row === undefined ? undefined : toTimelineEventRecord(row);
  }

  public listTimelineEvents(familyId: string): readonly TimelineEventRecord[] {
    return this.database.db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.familyId, familyId))
      .orderBy(asc(timelineEvents.createdAt), asc(timelineEvents.id))
      .all()
      .map(toTimelineEventRecord);
  }

  public createContradiction(input: CreateContradictionInput): ContradictionRecord {
    if (input.type === 'fact_value') {
      this.requireFact(input.familyId, input.leftFactId);
      this.requireFact(input.familyId, input.rightFactId);
    } else {
      this.requireTimelineEvent(input.familyId, input.leftTimelineEventId);
      this.requireTimelineEvent(input.familyId, input.rightTimelineEventId);
    }

    const record: ContradictionRecord = {
      id: randomUUID(),
      familyId: input.familyId,
      type: input.type,
      leftFactId: input.type === 'fact_value' ? input.leftFactId : null,
      rightFactId: input.type === 'fact_value' ? input.rightFactId : null,
      leftTimelineEventId: input.type === 'timeline_date' ? input.leftTimelineEventId : null,
      rightTimelineEventId: input.type === 'timeline_date' ? input.rightTimelineEventId : null,
      status: 'unresolved',
    };
    const now = new Date();

    this.database.db
      .insert(contradictions)
      .values({
        id: record.id,
        familyId: record.familyId,
        contradictionType: record.type,
        leftFactId: record.leftFactId,
        rightFactId: record.rightFactId,
        leftTimelineEventId: record.leftTimelineEventId,
        rightTimelineEventId: record.rightTimelineEventId,
        status: record.status,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return record;
  }

  public findContradiction(
    familyId: string,
    contradictionId: string,
  ): ContradictionRecord | undefined {
    const row = this.database.db
      .select()
      .from(contradictions)
      .where(and(eq(contradictions.familyId, familyId), eq(contradictions.id, contradictionId)))
      .limit(1)
      .get();
    return row === undefined ? undefined : toContradictionRecord(row);
  }

  public listContradictions(familyId: string): readonly ContradictionRecord[] {
    return this.database.db
      .select()
      .from(contradictions)
      .where(eq(contradictions.familyId, familyId))
      .orderBy(asc(contradictions.createdAt), asc(contradictions.id))
      .all()
      .map(toContradictionRecord);
  }

  private requirePerson(familyId: string, personId: string): void {
    const found = this.database.db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.familyId, familyId), eq(people.id, personId)))
      .limit(1)
      .get();
    if (found === undefined) {
      throw new StoryMemoryRepositoryError(
        'PERSON_NOT_IN_FAMILY',
        'The person does not belong to this family.',
      );
    }
  }

  private requireAnswer(familyId: string, answerId: string): void {
    const found = this.database.db
      .select({ id: answers.id })
      .from(answers)
      .where(and(eq(answers.familyId, familyId), eq(answers.id, answerId)))
      .limit(1)
      .get();
    if (found === undefined) {
      throw new StoryMemoryRepositoryError(
        'ANSWER_NOT_IN_FAMILY',
        'The source answer does not belong to this family.',
      );
    }
  }

  private requireFact(familyId: string, factId: string): void {
    if (this.findFact(familyId, factId) === undefined) {
      throw new StoryMemoryRepositoryError(
        'FACT_NOT_IN_FAMILY',
        'The fact does not belong to this family.',
      );
    }
  }

  private requireTimelineEvent(familyId: string, eventId: string): void {
    if (this.findTimelineEvent(familyId, eventId) === undefined) {
      throw new StoryMemoryRepositoryError(
        'TIMELINE_EVENT_NOT_IN_FAMILY',
        'The timeline event does not belong to this family.',
      );
    }
  }
}

function requireConfidence(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new StoryMemoryRepositoryError(
      'INVALID_CONFIDENCE',
      'Confidence must be a finite number from 0 through 1.',
    );
  }
}

function toFactRecord(row: typeof facts.$inferSelect): FactRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    subjectPersonId: row.subjectPersonId,
    factType: row.factType,
    normalizedValue: row.normalizedValue,
    confidence: row.confidence,
    status: row.approvalStatus,
  };
}

function toRelationshipRecord(row: typeof relationships.$inferSelect): RelationshipRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    fromPersonId: row.fromPersonId,
    toPersonId: row.toPersonId,
    relationshipType: row.relationshipType,
    confidence: row.confidence,
    status: row.approvalStatus,
  };
}

function toTimelineEventRecord(row: typeof timelineEvents.$inferSelect): TimelineEventRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    subjectPersonId: row.subjectPersonId,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    date: approximateDateSchema.parse({
      earliestYear: row.earliestYear,
      latestYear: row.latestYear,
      precision: row.datePrecision,
    }),
    status: row.approvalStatus,
  };
}

function toContradictionRecord(row: typeof contradictions.$inferSelect): ContradictionRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    type: row.contradictionType,
    leftFactId: row.leftFactId,
    rightFactId: row.rightFactId,
    leftTimelineEventId: row.leftTimelineEventId,
    rightTimelineEventId: row.rightTimelineEventId,
    status: row.status,
  };
}
