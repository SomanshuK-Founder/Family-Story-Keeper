import type {
  ApplyApprovalRecord,
  ContextChapterRecord,
  ContextFactRecord,
  ContextRelationshipRecord,
  ContextTimelineEventRecord,
  DeletePendingMemoryRecord,
  NarratorMemoryRepository,
  PrivacyRepository,
} from '@story-keeper/database';
import { PrivacyRepositoryError } from '@story-keeper/database';
import type {
  ApprovalAction,
  ApprovalTargetType,
  StoryContextPersonIdentity,
  StoryItemTargetType,
} from '@story-keeper/shared';

import { StoryKeeperError } from './errors.js';

export interface StoryContextConflict {
  readonly contradictionId: string;
  readonly contradictionType: 'fact_value' | 'timeline_date';
  readonly status: 'unresolved';
}

export interface GetStoryContextResult {
  readonly actor: {
    readonly id: string;
    readonly displayName: string;
    readonly role: 'narrator' | 'relative' | 'child';
  };
  readonly visibility: 'narrator_review' | 'approved_family';
  readonly personIdentities: readonly StoryContextPersonIdentity[];
  readonly facts: readonly ContextFactRecord[];
  readonly relationships: readonly ContextRelationshipRecord[];
  readonly timelineEvents: readonly ContextTimelineEventRecord[];
  readonly chapters: readonly ContextChapterRecord[];
  readonly conflicts: readonly StoryContextConflict[];
}

export type ApproveStoryItemResult = ApplyApprovalRecord;
export type DeletePendingMemoryResult = DeletePendingMemoryRecord;

export class PrivacyService {
  public constructor(
    private readonly privacy: PrivacyRepository,
    private readonly narratorMemory: NarratorMemoryRepository,
  ) {}

  public getStoryContext(familyId: string, actorPersonId: string): GetStoryContextResult {
    const actor = this.privacy.findActor(familyId, actorPersonId);
    if (actor === undefined) {
      throw new StoryKeeperError(
        'ACTOR_NOT_AUTHORIZED',
        'The actor is not an active member of this family.',
      );
    }

    if (actor.role === 'narrator') {
      const context = this.privacy.listNarratorContext(familyId, actorPersonId);
      return {
        actor,
        visibility: 'narrator_review',
        ...context,
        conflicts: this.narratorMemory
          .listPendingConflicts(familyId, actorPersonId)
          .map((conflict) => ({
            contradictionId: conflict.id,
            contradictionType: conflict.type,
            status: 'unresolved' as const,
          })),
      };
    }

    return {
      actor,
      visibility: 'approved_family',
      ...this.privacy.listApprovedFamilyContext(familyId),
      conflicts: [],
    };
  }

  public approveStoryItem(
    familyId: string,
    actorPersonId: string,
    targetType: ApprovalTargetType,
    targetId: string,
    action: ApprovalAction,
  ): ApproveStoryItemResult {
    try {
      return this.privacy.applyApproval({
        familyId,
        actorPersonId,
        targetType,
        targetId,
        action,
      });
    } catch (error: unknown) {
      throw mapPrivacyError(error);
    }
  }

  public deletePendingMemory(
    familyId: string,
    actorPersonId: string,
    targetType: StoryItemTargetType,
    targetId: string,
  ): DeletePendingMemoryResult {
    try {
      return this.privacy.deletePendingMemory({
        familyId,
        actorPersonId,
        targetType,
        targetId,
      });
    } catch (error: unknown) {
      throw mapPrivacyError(error);
    }
  }
}

function mapPrivacyError(error: unknown): StoryKeeperError {
  if (!(error instanceof PrivacyRepositoryError)) throw error;
  return new StoryKeeperError(error.code, error.message);
}
