import { randomUUID } from 'node:crypto';

import type {
  ApprovalAction,
  ApproximateDate,
  RelationshipType,
  StoryItemStatus,
  StoryItemTargetType,
} from '@story-keeper/shared';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';

import type { StoryKeeperDatabase } from './database.js';
import {
  answers,
  approvals,
  consentEvents,
  facts,
  factSources,
  familyMemberships,
  people,
  personCandidates,
  relationships,
  relationshipSources,
  timelineEvents,
  timelineEventSources,
} from './schema.js';

export type FamilyRole = 'narrator' | 'relative' | 'child';

export interface PrivacyActorRecord {
  readonly id: string;
  readonly displayName: string;
  readonly role: FamilyRole;
}

export interface ContextFactRecord {
  readonly id: string;
  readonly subjectPersonId: string;
  readonly factType: string;
  readonly value: string;
  readonly confidence: number;
  readonly status: StoryItemStatus;
  readonly sourceCount: number;
}

export interface ContextRelationshipRecord {
  readonly id: string;
  readonly fromPersonId: string;
  readonly toPersonId: string;
  readonly relationshipType: RelationshipType;
  readonly confidence: number;
  readonly status: StoryItemStatus;
  readonly sourceCount: number;
}

export interface ContextTimelineEventRecord {
  readonly id: string;
  readonly subjectPersonId: string;
  readonly eventType: string;
  readonly title: string;
  readonly description: string;
  readonly date: ApproximateDate;
  readonly status: StoryItemStatus;
  readonly sourceCount: number;
}

export interface StoryContextRecord {
  readonly facts: readonly ContextFactRecord[];
  readonly relationships: readonly ContextRelationshipRecord[];
  readonly timelineEvents: readonly ContextTimelineEventRecord[];
}

export interface ApplyApprovalInput {
  readonly familyId: string;
  readonly actorPersonId: string;
  readonly targetType: StoryItemTargetType;
  readonly targetId: string;
  readonly action: ApprovalAction;
  readonly occurredAt?: Date;
}

export interface ApplyApprovalRecord {
  readonly targetType: StoryItemTargetType;
  readonly targetId: string;
  readonly action: ApprovalAction;
  readonly status: 'updated' | 'already_applied';
  readonly itemStatus: 'approved' | 'rejected';
}

export interface DeletePendingMemoryInput {
  readonly familyId: string;
  readonly actorPersonId: string;
  readonly targetType: StoryItemTargetType;
  readonly targetId: string;
  readonly occurredAt?: Date;
}

export interface DeletePendingMemoryRecord {
  readonly targetType: StoryItemTargetType;
  readonly targetId: string;
  readonly status: 'deleted' | 'already_deleted';
  readonly itemStatus: 'rejected';
}

export type PrivacyRepositoryErrorCode =
  | 'ACTOR_NOT_AUTHORIZED'
  | 'STORY_ITEM_NOT_FOUND'
  | 'STORY_ITEM_NOT_RELEVANT'
  | 'STORY_ITEM_STATE_CONFLICT'
  | 'STORY_ITEM_PROVENANCE_REQUIRED'
  | 'STORY_ITEM_IDENTITY_UNRESOLVED';

export class PrivacyRepositoryError extends Error {
  public constructor(
    public readonly code: PrivacyRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PrivacyRepositoryError';
  }
}

export interface PrivacyRepository {
  findActor(familyId: string, actorPersonId: string): PrivacyActorRecord | undefined;
  listNarratorContext(familyId: string, narratorPersonId: string): StoryContextRecord;
  listApprovedFamilyContext(familyId: string): StoryContextRecord;
  applyApproval(input: ApplyApprovalInput): ApplyApprovalRecord;
  deletePendingMemory(input: DeletePendingMemoryInput): DeletePendingMemoryRecord;
}

export class DrizzlePrivacyRepository implements PrivacyRepository {
  public constructor(private readonly database: StoryKeeperDatabase) {}

  public findActor(familyId: string, actorPersonId: string): PrivacyActorRecord | undefined {
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
          eq(people.id, actorPersonId),
          eq(people.status, 'active'),
          eq(familyMemberships.status, 'active'),
        ),
      )
      .limit(1)
      .get();
  }

  public listNarratorContext(familyId: string, narratorPersonId: string): StoryContextRecord {
    return this.listContext(familyId, narratorPersonId);
  }

  public listApprovedFamilyContext(familyId: string): StoryContextRecord {
    return this.listContext(familyId);
  }

  public applyApproval(input: ApplyApprovalInput): ApplyApprovalRecord {
    return this.database.db.transaction((transaction) => {
      requireNarratorActor(transaction, input.familyId, input.actorPersonId);

      let currentStatus: StoryItemStatus;
      let relevant: boolean;
      if (input.targetType === 'fact') {
        const target = transaction
          .select({ status: facts.approvalStatus, subjectPersonId: facts.subjectPersonId })
          .from(facts)
          .where(and(eq(facts.familyId, input.familyId), eq(facts.id, input.targetId)))
          .limit(1)
          .get();
        if (target === undefined) throw storyItemNotFound();
        currentStatus = target.status;
        relevant = target.subjectPersonId === input.actorPersonId;
      } else if (input.targetType === 'relationship') {
        const target = transaction
          .select({
            status: relationships.approvalStatus,
            fromPersonId: relationships.fromPersonId,
            toPersonId: relationships.toPersonId,
          })
          .from(relationships)
          .where(
            and(eq(relationships.familyId, input.familyId), eq(relationships.id, input.targetId)),
          )
          .limit(1)
          .get();
        if (target === undefined) throw storyItemNotFound();
        currentStatus = target.status;
        relevant =
          target.fromPersonId === input.actorPersonId || target.toPersonId === input.actorPersonId;
      } else {
        const target = transaction
          .select({
            status: timelineEvents.approvalStatus,
            subjectPersonId: timelineEvents.subjectPersonId,
          })
          .from(timelineEvents)
          .where(
            and(eq(timelineEvents.familyId, input.familyId), eq(timelineEvents.id, input.targetId)),
          )
          .limit(1)
          .get();
        if (target === undefined) throw storyItemNotFound();
        currentStatus = target.status;
        relevant = target.subjectPersonId === input.actorPersonId;
      }

      if (!relevant) {
        throw new PrivacyRepositoryError(
          'STORY_ITEM_NOT_RELEVANT',
          'The story item is not eligible for this narrator.',
        );
      }

      const desiredStatus = input.action === 'approve' ? 'approved' : 'rejected';
      const expectedStatus = input.action === 'revoke' ? 'approved' : 'pending';
      if (currentStatus !== expectedStatus) {
        const latestAction = transaction
          .select({ action: approvals.action })
          .from(approvals)
          .where(
            and(
              eq(approvals.familyId, input.familyId),
              eq(approvals.actorPersonId, input.actorPersonId),
              eq(approvals.targetType, input.targetType),
              eq(approvals.targetId, input.targetId),
            ),
          )
          .orderBy(desc(approvals.createdAt), desc(approvals.id))
          .limit(1)
          .get()?.action;
        if (currentStatus === desiredStatus && latestAction === input.action) {
          return {
            targetType: input.targetType,
            targetId: input.targetId,
            action: input.action,
            status: 'already_applied',
            itemStatus: desiredStatus,
          };
        }
        throw stateConflict();
      }

      if (input.action === 'approve') {
        requireProvenance(transaction, input.familyId, input.targetType, input.targetId);
        if (input.targetType === 'relationship') {
          requireResolvedRelationshipIdentity(transaction, input.familyId, input.targetId);
        }
      }

      const occurredAt = input.occurredAt ?? new Date();
      const changes = updateTargetStatus(
        transaction,
        input.familyId,
        input.targetType,
        input.targetId,
        expectedStatus,
        desiredStatus,
        occurredAt,
      );
      if (changes !== 1) throw stateConflict();

      transaction
        .insert(approvals)
        .values({
          id: randomUUID(),
          familyId: input.familyId,
          actorPersonId: input.actorPersonId,
          targetType: input.targetType,
          targetId: input.targetId,
          action: input.action,
          createdAt: occurredAt,
        })
        .run();
      transaction
        .insert(consentEvents)
        .values({
          id: randomUUID(),
          familyId: input.familyId,
          personId: input.actorPersonId,
          eventType:
            input.action === 'approve'
              ? 'story_item_approved'
              : input.action === 'reject'
                ? 'story_item_rejected'
                : 'story_item_revoked',
          targetType: input.targetType,
          targetId: input.targetId,
          createdAt: occurredAt,
        })
        .run();

      return {
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        status: 'updated',
        itemStatus: desiredStatus,
      };
    });
  }

  public deletePendingMemory(input: DeletePendingMemoryInput): DeletePendingMemoryRecord {
    return this.database.db.transaction((transaction) => {
      requireNarratorActor(transaction, input.familyId, input.actorPersonId);

      let currentStatus: StoryItemStatus;
      let relevant: boolean;
      if (input.targetType === 'fact') {
        const target = transaction
          .select({ status: facts.approvalStatus, subjectPersonId: facts.subjectPersonId })
          .from(facts)
          .where(and(eq(facts.familyId, input.familyId), eq(facts.id, input.targetId)))
          .limit(1)
          .get();
        if (target === undefined) throw storyItemNotFound();
        currentStatus = target.status;
        relevant = target.subjectPersonId === input.actorPersonId;
      } else if (input.targetType === 'relationship') {
        const target = transaction
          .select({
            status: relationships.approvalStatus,
            fromPersonId: relationships.fromPersonId,
            toPersonId: relationships.toPersonId,
          })
          .from(relationships)
          .where(
            and(eq(relationships.familyId, input.familyId), eq(relationships.id, input.targetId)),
          )
          .limit(1)
          .get();
        if (target === undefined) throw storyItemNotFound();
        currentStatus = target.status;
        relevant =
          target.fromPersonId === input.actorPersonId || target.toPersonId === input.actorPersonId;
      } else {
        const target = transaction
          .select({
            status: timelineEvents.approvalStatus,
            subjectPersonId: timelineEvents.subjectPersonId,
          })
          .from(timelineEvents)
          .where(
            and(eq(timelineEvents.familyId, input.familyId), eq(timelineEvents.id, input.targetId)),
          )
          .limit(1)
          .get();
        if (target === undefined) throw storyItemNotFound();
        currentStatus = target.status;
        relevant = target.subjectPersonId === input.actorPersonId;
      }
      if (!relevant) {
        throw new PrivacyRepositoryError(
          'STORY_ITEM_NOT_RELEVANT',
          'The story item is not eligible for this narrator.',
        );
      }

      if (currentStatus === 'rejected') {
        const priorDelete = transaction
          .select({ id: consentEvents.id })
          .from(consentEvents)
          .where(
            and(
              eq(consentEvents.familyId, input.familyId),
              eq(consentEvents.personId, input.actorPersonId),
              eq(consentEvents.eventType, 'pending_memory_deleted'),
              eq(consentEvents.targetType, input.targetType),
              eq(consentEvents.targetId, input.targetId),
            ),
          )
          .limit(1)
          .get();
        if (priorDelete !== undefined) {
          return {
            targetType: input.targetType,
            targetId: input.targetId,
            status: 'already_deleted',
            itemStatus: 'rejected',
          };
        }
        throw stateConflict();
      }
      if (currentStatus !== 'pending') throw stateConflict();

      const occurredAt = input.occurredAt ?? new Date();
      const changes = updateTargetStatus(
        transaction,
        input.familyId,
        input.targetType,
        input.targetId,
        'pending',
        'rejected',
        occurredAt,
      );
      if (changes !== 1) throw stateConflict();

      transaction
        .insert(consentEvents)
        .values({
          id: randomUUID(),
          familyId: input.familyId,
          personId: input.actorPersonId,
          eventType: 'pending_memory_deleted',
          targetType: input.targetType,
          targetId: input.targetId,
          createdAt: occurredAt,
        })
        .run();

      return {
        targetType: input.targetType,
        targetId: input.targetId,
        status: 'deleted',
        itemStatus: 'rejected',
      };
    });
  }

  private listContext(familyId: string, narratorPersonId?: string): StoryContextRecord {
    const factRows = this.database.db
      .select()
      .from(facts)
      .where(
        narratorPersonId === undefined
          ? and(eq(facts.familyId, familyId), eq(facts.approvalStatus, 'approved'))
          : and(
              eq(facts.familyId, familyId),
              eq(facts.subjectPersonId, narratorPersonId),
              inArray(facts.approvalStatus, ['pending', 'approved']),
            ),
      )
      .orderBy(asc(facts.createdAt), asc(facts.id))
      .all();
    const relationshipRows = this.database.db
      .select()
      .from(relationships)
      .where(
        narratorPersonId === undefined
          ? and(eq(relationships.familyId, familyId), eq(relationships.approvalStatus, 'approved'))
          : and(
              eq(relationships.familyId, familyId),
              or(
                eq(relationships.fromPersonId, narratorPersonId),
                eq(relationships.toPersonId, narratorPersonId),
              ),
              inArray(relationships.approvalStatus, ['pending', 'approved']),
            ),
      )
      .orderBy(asc(relationships.createdAt), asc(relationships.id))
      .all();
    const eventRows = this.database.db
      .select()
      .from(timelineEvents)
      .where(
        narratorPersonId === undefined
          ? and(
              eq(timelineEvents.familyId, familyId),
              eq(timelineEvents.approvalStatus, 'approved'),
            )
          : and(
              eq(timelineEvents.familyId, familyId),
              eq(timelineEvents.subjectPersonId, narratorPersonId),
              inArray(timelineEvents.approvalStatus, ['pending', 'approved']),
            ),
      )
      .orderBy(asc(timelineEvents.createdAt), asc(timelineEvents.id))
      .all();

    return {
      facts: factRows.map((fact) => ({
        id: fact.id,
        subjectPersonId: fact.subjectPersonId,
        factType: fact.factType,
        value: fact.normalizedValue,
        confidence: fact.confidence,
        status: fact.approvalStatus,
        sourceCount: countFactSources(this.database, familyId, fact.id),
      })),
      relationships: relationshipRows.map((relationship) => ({
        id: relationship.id,
        fromPersonId: relationship.fromPersonId,
        toPersonId: relationship.toPersonId,
        relationshipType: relationship.relationshipType,
        confidence: relationship.confidence,
        status: relationship.approvalStatus,
        sourceCount: countRelationshipSources(this.database, familyId, relationship.id),
      })),
      timelineEvents: eventRows.map((event) => ({
        id: event.id,
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
        sourceCount: countTimelineSources(this.database, familyId, event.id),
      })),
    };
  }
}

type Transaction = Parameters<Parameters<StoryKeeperDatabase['db']['transaction']>[0]>[0];

function requireNarratorActor(
  transaction: Transaction,
  familyId: string,
  actorPersonId: string,
): void {
  const actor = transaction
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
  if (actor === undefined) {
    throw new PrivacyRepositoryError(
      'ACTOR_NOT_AUTHORIZED',
      'The actor is not authorized for this story operation.',
    );
  }
}

function requireProvenance(
  transaction: Transaction,
  familyId: string,
  targetType: StoryItemTargetType,
  targetId: string,
): void {
  let exists: boolean;
  if (targetType === 'fact') {
    exists =
      transaction
        .select({ id: factSources.id })
        .from(factSources)
        .innerJoin(
          answers,
          and(eq(answers.familyId, factSources.familyId), eq(answers.id, factSources.answerId)),
        )
        .where(and(eq(factSources.familyId, familyId), eq(factSources.factId, targetId)))
        .limit(1)
        .get() !== undefined;
  } else if (targetType === 'relationship') {
    exists =
      transaction
        .select({ id: relationshipSources.id })
        .from(relationshipSources)
        .innerJoin(
          answers,
          and(
            eq(answers.familyId, relationshipSources.familyId),
            eq(answers.id, relationshipSources.answerId),
          ),
        )
        .where(
          and(
            eq(relationshipSources.familyId, familyId),
            eq(relationshipSources.relationshipId, targetId),
          ),
        )
        .limit(1)
        .get() !== undefined;
  } else {
    exists =
      transaction
        .select({ id: timelineEventSources.id })
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
            eq(timelineEventSources.timelineEventId, targetId),
          ),
        )
        .limit(1)
        .get() !== undefined;
  }
  if (!exists) {
    throw new PrivacyRepositoryError(
      'STORY_ITEM_PROVENANCE_REQUIRED',
      'The story item cannot be approved without valid source provenance.',
    );
  }
}

function requireResolvedRelationshipIdentity(
  transaction: Transaction,
  familyId: string,
  relationshipId: string,
): void {
  const relationship = transaction
    .select({
      fromPersonId: relationships.fromPersonId,
      toPersonId: relationships.toPersonId,
    })
    .from(relationships)
    .where(and(eq(relationships.familyId, familyId), eq(relationships.id, relationshipId)))
    .limit(1)
    .get();
  if (relationship === undefined) throw storyItemNotFound();
  const activePeople = transaction
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        eq(people.familyId, familyId),
        inArray(people.id, [relationship.fromPersonId, relationship.toPersonId]),
        eq(people.status, 'active'),
      ),
    )
    .all();
  const unresolvedCandidate = transaction
    .select({ id: personCandidates.id })
    .from(personCandidates)
    .where(
      and(
        eq(personCandidates.familyId, familyId),
        inArray(personCandidates.candidatePersonId, [
          relationship.fromPersonId,
          relationship.toPersonId,
        ]),
        eq(personCandidates.status, 'unresolved'),
      ),
    )
    .limit(1)
    .get();
  if (activePeople.length !== 2 || unresolvedCandidate !== undefined) {
    throw new PrivacyRepositoryError(
      'STORY_ITEM_IDENTITY_UNRESOLVED',
      'The relationship cannot be approved while a referenced identity is unresolved.',
    );
  }
}

function updateTargetStatus(
  transaction: Transaction,
  familyId: string,
  targetType: StoryItemTargetType,
  targetId: string,
  expectedStatus: StoryItemStatus,
  desiredStatus: StoryItemStatus,
  occurredAt: Date,
): number {
  if (targetType === 'fact') {
    return transaction
      .update(facts)
      .set({ approvalStatus: desiredStatus, updatedAt: occurredAt })
      .where(
        and(
          eq(facts.familyId, familyId),
          eq(facts.id, targetId),
          eq(facts.approvalStatus, expectedStatus),
        ),
      )
      .run().changes;
  }
  if (targetType === 'relationship') {
    return transaction
      .update(relationships)
      .set({ approvalStatus: desiredStatus, updatedAt: occurredAt })
      .where(
        and(
          eq(relationships.familyId, familyId),
          eq(relationships.id, targetId),
          eq(relationships.approvalStatus, expectedStatus),
        ),
      )
      .run().changes;
  }
  return transaction
    .update(timelineEvents)
    .set({ approvalStatus: desiredStatus, updatedAt: occurredAt })
    .where(
      and(
        eq(timelineEvents.familyId, familyId),
        eq(timelineEvents.id, targetId),
        eq(timelineEvents.approvalStatus, expectedStatus),
      ),
    )
    .run().changes;
}

function countFactSources(database: StoryKeeperDatabase, familyId: string, factId: string): number {
  return database.db
    .select({ id: factSources.id })
    .from(factSources)
    .where(and(eq(factSources.familyId, familyId), eq(factSources.factId, factId)))
    .all().length;
}

function countRelationshipSources(
  database: StoryKeeperDatabase,
  familyId: string,
  relationshipId: string,
): number {
  return database.db
    .select({ id: relationshipSources.id })
    .from(relationshipSources)
    .where(
      and(
        eq(relationshipSources.familyId, familyId),
        eq(relationshipSources.relationshipId, relationshipId),
      ),
    )
    .all().length;
}

function countTimelineSources(
  database: StoryKeeperDatabase,
  familyId: string,
  eventId: string,
): number {
  return database.db
    .select({ id: timelineEventSources.id })
    .from(timelineEventSources)
    .where(
      and(
        eq(timelineEventSources.familyId, familyId),
        eq(timelineEventSources.timelineEventId, eventId),
      ),
    )
    .all().length;
}

function storyItemNotFound(): PrivacyRepositoryError {
  return new PrivacyRepositoryError(
    'STORY_ITEM_NOT_FOUND',
    'The story item was not found in this family.',
  );
}

function stateConflict(): PrivacyRepositoryError {
  return new PrivacyRepositoryError(
    'STORY_ITEM_STATE_CONFLICT',
    'The story item is not in the required state for this action.',
  );
}
