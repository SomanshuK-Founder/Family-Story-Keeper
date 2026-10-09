import type { PresentationRepository, PrivacyRepository } from '@story-keeper/database';
import {
  approvedChaptersResponseSchema,
  familyGraphResponseSchema,
  timelineResponseSchema,
  type ApprovedChaptersResponse,
  type FamilyGraphResponse,
  type TimelineResponse,
} from '@story-keeper/shared';

import { StoryKeeperError } from './errors.js';

export class PresentationService {
  public constructor(
    private readonly privacy: PrivacyRepository,
    private readonly presentation: PresentationRepository,
  ) {}

  public getTimeline(familyId: string, actorPersonId: string): TimelineResponse {
    this.requireActiveActor(familyId, actorPersonId);
    const items = [...this.presentation.listApprovedTimeline(familyId)]
      .sort(compareTimelineRecords)
      .map((event) => ({
        id: event.id,
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        personId: event.personId,
        personDisplayName: event.personDisplayName,
        date: {
          earliestYear: event.earliestYear,
          latestYear: event.latestYear,
          precision: event.precision,
        },
        status: 'approved' as const,
        sourceCount: event.sourceCount,
      }));
    return timelineResponseSchema.parse({ items });
  }

  public getFamilyGraph(familyId: string, actorPersonId: string): FamilyGraphResponse {
    this.requireActiveActor(familyId, actorPersonId);
    const graph = this.presentation.getApprovedFamilyGraph(familyId);
    const nodes = [...graph.nodes]
      .sort(
        (left, right) =>
          compareText(left.displayName, right.displayName) ||
          compareText(left.personId, right.personId),
      )
      .map((node) => ({ ...node }));
    const edges = [...graph.edges]
      .sort(
        (left, right) =>
          compareText(left.relationshipType, right.relationshipType) ||
          compareText(left.fromPersonId, right.fromPersonId) ||
          compareText(left.toPersonId, right.toPersonId) ||
          left.createdAt.getTime() - right.createdAt.getTime() ||
          compareText(left.relationshipId, right.relationshipId),
      )
      .map((edge) => ({
        relationshipId: edge.relationshipId,
        fromPersonId: edge.fromPersonId,
        toPersonId: edge.toPersonId,
        relationshipType: edge.relationshipType,
        status: 'approved' as const,
        sourceCount: edge.sourceCount,
      }));
    return familyGraphResponseSchema.parse({ nodes, edges });
  }

  public getApprovedChapters(familyId: string, actorPersonId: string): ApprovedChaptersResponse {
    this.requireActiveActor(familyId, actorPersonId);
    const chapters = [...this.presentation.listApprovedChapters(familyId)]
      .sort(
        (left, right) =>
          left.approvedAt.getTime() - right.approvedAt.getTime() ||
          left.createdAt.getTime() - right.createdAt.getTime() ||
          compareText(left.chapterId, right.chapterId),
      )
      .map((chapter) => ({
        chapterId: chapter.chapterId,
        title: chapter.title,
        body: chapter.body,
        narratorPersonId: chapter.narratorPersonId,
        narratorDisplayName: chapter.narratorDisplayName,
        approvedAt: chapter.approvedAt.toISOString(),
        sourceCount: chapter.sourceCount,
      }));
    return approvedChaptersResponseSchema.parse({ chapters });
  }

  private requireActiveActor(familyId: string, actorPersonId: string): void {
    if (this.privacy.findActor(familyId, actorPersonId) === undefined) {
      throw new StoryKeeperError(
        'ACTOR_NOT_AUTHORIZED',
        'The actor is not an active member of this family.',
      );
    }
  }
}

function compareTimelineRecords(
  left: ReturnType<PresentationRepository['listApprovedTimeline']>[number],
  right: ReturnType<PresentationRepository['listApprovedTimeline']>[number],
): number {
  const leftUnknown = left.precision === 'unknown' ? 1 : 0;
  const rightUnknown = right.precision === 'unknown' ? 1 : 0;
  return (
    leftUnknown - rightUnknown ||
    (left.earliestYear ?? Number.MAX_SAFE_INTEGER) -
      (right.earliestYear ?? Number.MAX_SAFE_INTEGER) ||
    (left.latestYear ?? Number.MAX_SAFE_INTEGER) - (right.latestYear ?? Number.MAX_SAFE_INTEGER) ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    compareText(left.id, right.id)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
