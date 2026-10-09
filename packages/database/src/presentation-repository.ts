import type { DatePrecision, RelationshipType } from '@story-keeper/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { StoryKeeperDatabase } from './database.js';
import {
  chapterDrafts,
  chapterSources,
  contradictions,
  familyMemberships,
  people,
  personCandidates,
  relationships,
  relationshipSources,
  timelineEvents,
  timelineEventSources,
} from './schema.js';

export interface PresentationTimelineRecord {
  readonly id: string;
  readonly eventType: string;
  readonly title: string;
  readonly description: string;
  readonly personId: string;
  readonly personDisplayName: string;
  readonly earliestYear: number | null;
  readonly latestYear: number | null;
  readonly precision: DatePrecision;
  readonly sourceCount: number;
  readonly createdAt: Date;
}

export interface PresentationGraphNodeRecord {
  readonly personId: string;
  readonly displayName: string;
  readonly role: 'narrator' | 'relative' | 'child' | null;
  readonly status: 'active' | 'inactive';
}

export interface PresentationGraphEdgeRecord {
  readonly relationshipId: string;
  readonly fromPersonId: string;
  readonly toPersonId: string;
  readonly relationshipType: RelationshipType;
  readonly sourceCount: number;
  readonly createdAt: Date;
}

export interface PresentationGraphRecord {
  readonly nodes: readonly PresentationGraphNodeRecord[];
  readonly edges: readonly PresentationGraphEdgeRecord[];
}

export interface PresentationChapterRecord {
  readonly chapterId: string;
  readonly title: string;
  readonly body: string;
  readonly narratorPersonId: string;
  readonly narratorDisplayName: string;
  readonly approvedAt: Date;
  readonly sourceCount: number;
  readonly createdAt: Date;
}

export interface PresentationRepository {
  listApprovedTimeline(familyId: string): readonly PresentationTimelineRecord[];
  getApprovedFamilyGraph(familyId: string): PresentationGraphRecord;
  listApprovedChapters(familyId: string): readonly PresentationChapterRecord[];
}

export class DrizzlePresentationRepository implements PresentationRepository {
  public constructor(private readonly database: StoryKeeperDatabase) {}

  public listApprovedTimeline(familyId: string): readonly PresentationTimelineRecord[] {
    const unresolvedEventIds = new Set(
      this.database.db
        .select({
          left: contradictions.leftTimelineEventId,
          right: contradictions.rightTimelineEventId,
        })
        .from(contradictions)
        .where(
          and(
            eq(contradictions.familyId, familyId),
            eq(contradictions.status, 'unresolved'),
            eq(contradictions.contradictionType, 'timeline_date'),
          ),
        )
        .all()
        .flatMap(({ left, right }) => [left, right])
        .filter((id): id is string => id !== null),
    );
    const rows = this.database.db
      .select({
        id: timelineEvents.id,
        eventType: timelineEvents.eventType,
        title: timelineEvents.title,
        description: timelineEvents.description,
        personId: timelineEvents.subjectPersonId,
        personDisplayName: people.canonicalDisplayName,
        earliestYear: timelineEvents.earliestYear,
        latestYear: timelineEvents.latestYear,
        precision: timelineEvents.datePrecision,
        createdAt: timelineEvents.createdAt,
      })
      .from(timelineEvents)
      .innerJoin(
        people,
        and(
          eq(people.familyId, timelineEvents.familyId),
          eq(people.id, timelineEvents.subjectPersonId),
        ),
      )
      .where(
        and(eq(timelineEvents.familyId, familyId), eq(timelineEvents.approvalStatus, 'approved')),
      )
      .all()
      .filter(({ id }) => !unresolvedEventIds.has(id));
    const sourceCounts = countById(
      rows.map(({ id }) => id),
      (ids) =>
        this.database.db
          .select({ itemId: timelineEventSources.timelineEventId })
          .from(timelineEventSources)
          .where(
            and(
              eq(timelineEventSources.familyId, familyId),
              inArray(timelineEventSources.timelineEventId, ids),
            ),
          )
          .all(),
    );
    return rows.map((row) => ({ ...row, sourceCount: sourceCounts.get(row.id) ?? 0 }));
  }

  public getApprovedFamilyGraph(familyId: string): PresentationGraphRecord {
    const candidatePersonIds = new Set(
      this.database.db
        .select({ personId: personCandidates.candidatePersonId })
        .from(personCandidates)
        .where(eq(personCandidates.familyId, familyId))
        .all()
        .map(({ personId }) => personId),
    );
    const relationshipRows = this.database.db
      .select({
        relationshipId: relationships.id,
        fromPersonId: relationships.fromPersonId,
        toPersonId: relationships.toPersonId,
        relationshipType: relationships.relationshipType,
        createdAt: relationships.createdAt,
      })
      .from(relationships)
      .where(
        and(eq(relationships.familyId, familyId), eq(relationships.approvalStatus, 'approved')),
      )
      .all()
      .filter(
        ({ fromPersonId, toPersonId }) =>
          !candidatePersonIds.has(fromPersonId) && !candidatePersonIds.has(toPersonId),
      );
    const membershipRows = this.database.db
      .select({ personId: familyMemberships.personId, role: familyMemberships.role })
      .from(familyMemberships)
      .where(eq(familyMemberships.familyId, familyId))
      .all();
    const personIds = [
      ...new Set(
        [
          ...membershipRows.map(({ personId }) => personId),
          ...relationshipRows.flatMap(({ fromPersonId, toPersonId }) => [fromPersonId, toPersonId]),
        ].filter((personId) => !candidatePersonIds.has(personId)),
      ),
    ];
    const personRows =
      personIds.length === 0
        ? []
        : this.database.db
            .select({
              personId: people.id,
              displayName: people.canonicalDisplayName,
              status: people.status,
            })
            .from(people)
            .where(and(eq(people.familyId, familyId), inArray(people.id, personIds)))
            .all();
    const roles = new Map(membershipRows.map(({ personId, role }) => [personId, role]));
    const sourceCounts = countById(
      relationshipRows.map(({ relationshipId }) => relationshipId),
      (ids) =>
        this.database.db
          .select({ itemId: relationshipSources.relationshipId })
          .from(relationshipSources)
          .where(
            and(
              eq(relationshipSources.familyId, familyId),
              inArray(relationshipSources.relationshipId, ids),
            ),
          )
          .all(),
    );

    return {
      nodes: personRows.map((person) => ({ ...person, role: roles.get(person.personId) ?? null })),
      edges: relationshipRows.map((relationship) => ({
        ...relationship,
        sourceCount: sourceCounts.get(relationship.relationshipId) ?? 0,
      })),
    };
  }

  public listApprovedChapters(familyId: string): readonly PresentationChapterRecord[] {
    const rows = this.database.db
      .select({
        chapterId: chapterDrafts.id,
        title: chapterDrafts.title,
        body: chapterDrafts.body,
        narratorPersonId: chapterDrafts.narratorPersonId,
        narratorDisplayName: people.canonicalDisplayName,
        approvedAt: chapterDrafts.reviewedAt,
        createdAt: chapterDrafts.createdAt,
      })
      .from(chapterDrafts)
      .innerJoin(
        people,
        and(
          eq(people.familyId, chapterDrafts.familyId),
          eq(people.id, chapterDrafts.narratorPersonId),
        ),
      )
      .where(and(eq(chapterDrafts.familyId, familyId), eq(chapterDrafts.status, 'approved')))
      .orderBy(asc(chapterDrafts.createdAt), asc(chapterDrafts.id))
      .all()
      .filter(
        (row): row is typeof row & { title: string; body: string; approvedAt: Date } =>
          row.title !== null && row.body !== null && row.approvedAt !== null,
      );
    const sourceCounts = countById(
      rows.map(({ chapterId }) => chapterId),
      (ids) =>
        this.database.db
          .select({ itemId: chapterSources.chapterDraftId })
          .from(chapterSources)
          .where(
            and(eq(chapterSources.familyId, familyId), inArray(chapterSources.chapterDraftId, ids)),
          )
          .all(),
    );
    return rows.map((row) => ({ ...row, sourceCount: sourceCounts.get(row.chapterId) ?? 0 }));
  }
}

function countById(
  ids: readonly string[],
  loadRows: (ids: readonly [string, ...string[]]) => readonly { readonly itemId: string }[],
): ReadonlyMap<string, number> {
  if (ids.length === 0) return new Map();
  const [first, ...rest] = ids;
  if (first === undefined) return new Map();
  const counts = new Map<string, number>();
  for (const { itemId } of loadRows([first, ...rest])) {
    counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  }
  return counts;
}
