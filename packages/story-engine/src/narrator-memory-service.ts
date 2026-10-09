import type {
  ConflictClaimRecord,
  InterviewRecord,
  InterviewRepository,
  NarratorConflictRecord,
  NarratorMemoryRepository,
  ResolveConflictRecord,
} from '@story-keeper/database';
import { NarratorMemoryRepositoryError } from '@story-keeper/database';
import type {
  ApproximateDate,
  ContradictionResolutionType,
  StoryItemStatus,
} from '@story-keeper/shared';

import { StoryKeeperError } from './errors.js';

export interface PublicFactConflictClaim {
  readonly kind: 'fact';
  readonly itemId: string;
  readonly factType: string;
  readonly value: string;
  readonly status: StoryItemStatus;
  readonly sourceAnswerIds: readonly string[];
}

export interface PublicTimelineConflictClaim {
  readonly kind: 'timeline_event';
  readonly itemId: string;
  readonly eventType: string;
  readonly title: string;
  readonly description: string;
  readonly date: ApproximateDate;
  readonly status: StoryItemStatus;
  readonly sourceAnswerIds: readonly string[];
}

export type PublicConflictClaim = PublicFactConflictClaim | PublicTimelineConflictClaim;

export interface PublicPendingConflict {
  readonly contradictionId: string;
  readonly contradictionType: 'fact_value' | 'timeline_date';
  readonly status: 'unresolved';
  readonly left: PublicConflictClaim;
  readonly right: PublicConflictClaim;
  readonly suggestedQuestion: string;
}

export interface ListPendingConflictsResult {
  readonly conflicts: readonly PublicPendingConflict[];
}

export interface ResolveConflictResult {
  readonly contradictionId: string;
  readonly status: 'resolved' | 'dismissed' | 'already_resolved';
  readonly resolutionType: ContradictionResolutionType;
  readonly resolvedByPersonId: string;
  readonly resolvedAt: string;
}

export interface PlannedQuestion {
  readonly type: 'contradiction_clarification' | 'person_clarification' | 'memory_follow_up';
  readonly source: 'contradiction' | 'clarification' | 'follow_up';
  readonly sourceReferenceId: string;
  readonly text: string;
}

export class NarratorMemoryService {
  public constructor(
    private readonly interviews: InterviewRepository,
    private readonly memory: NarratorMemoryRepository,
  ) {}

  public listPendingConflicts(familyId: string, interviewId: string): ListPendingConflictsResult {
    const interview = this.requireNarratorInterview(familyId, interviewId);
    return {
      conflicts: this.memory
        .listPendingConflicts(familyId, interview.narratorPersonId)
        .map(toPublicConflict),
    };
  }

  public resolveConflict(
    familyId: string,
    interviewId: string,
    contradictionId: string,
    resolutionType: ContradictionResolutionType,
  ): ResolveConflictResult {
    const interview = this.requireNarratorInterview(familyId, interviewId);
    try {
      return toResolveResult(
        this.memory.resolveConflict({
          familyId,
          narratorPersonId: interview.narratorPersonId,
          contradictionId,
          resolutionType,
        }),
      );
    } catch (error: unknown) {
      if (!(error instanceof NarratorMemoryRepositoryError)) throw error;
      if (error.code === 'CONTRADICTION_NOT_FOUND') {
        throw new StoryKeeperError('CONTRADICTION_NOT_FOUND', error.message);
      }
      if (error.code === 'CONFLICT_ALREADY_RESOLVED') {
        throw new StoryKeeperError('CONFLICT_ALREADY_RESOLVED', error.message);
      }
      throw new StoryKeeperError('INVALID_CONFLICT_RESOLUTION', error.message);
    }
  }

  public planNextQuestion(
    interview: InterviewRecord,
    usedSourceReferences: ReadonlySet<string>,
  ): PlannedQuestion | undefined {
    return (
      this.planContradictionQuestion(interview, usedSourceReferences) ??
      this.planMemoryQuestion(interview, usedSourceReferences)
    );
  }

  public planContradictionQuestion(
    interview: InterviewRecord,
    usedSourceReferences: ReadonlySet<string>,
  ): PlannedQuestion | undefined {
    for (const conflict of this.memory.listPendingConflicts(
      interview.familyId,
      interview.narratorPersonId,
    )) {
      const sourceReferenceId = `contradiction:${conflict.id}`;
      if (!usedSourceReferences.has(sourceReferenceId)) {
        return {
          type: 'contradiction_clarification',
          source: 'contradiction',
          sourceReferenceId,
          text: phraseConflictQuestion(conflict),
        };
      }
    }

    return undefined;
  }

  public planMemoryQuestion(
    interview: InterviewRecord,
    usedSourceReferences: ReadonlySet<string>,
  ): PlannedQuestion | undefined {
    for (const candidate of this.memory.listUnresolvedPersonCandidates(
      interview.familyId,
      interview.narratorPersonId,
    )) {
      const sourceReferenceId = `person:${candidate.id}`;
      if (!usedSourceReferences.has(sourceReferenceId)) {
        return {
          type: 'person_clarification',
          source: 'clarification',
          sourceReferenceId,
          text:
            candidate.possibleMatchName === null
              ? `You mentioned ${candidate.extractedName}. How was ${candidate.extractedName} connected to you?`
              : `You mentioned ${candidate.extractedName}. Is this someone we've already talked about, or a different ${candidate.extractedName}?`,
        };
      }
    }

    const events = this.memory.listTimelinePlanningCandidates(
      interview.familyId,
      interview.narratorPersonId,
    );
    for (const event of events) {
      const sourceReferenceId = `follow_up:event-detail:${event.id}`;
      if (
        event.date.precision !== 'unknown' &&
        event.description.trim().length < 80 &&
        !usedSourceReferences.has(sourceReferenceId)
      ) {
        return {
          type: 'memory_follow_up',
          source: 'follow_up',
          sourceReferenceId,
          text: `What do you remember most about “${event.title}”?`,
        };
      }
    }

    for (const event of events) {
      const sourceReferenceId = `follow_up:event-date:${event.id}`;
      if (event.date.precision === 'unknown' && !usedSourceReferences.has(sourceReferenceId)) {
        return {
          type: 'memory_follow_up',
          source: 'follow_up',
          sourceReferenceId,
          text: `About when did “${event.title}” happen?`,
        };
      }
    }

    return undefined;
  }

  private requireNarratorInterview(familyId: string, interviewId: string): InterviewRecord {
    const interview = this.interviews.findInterview(familyId, interviewId);
    if (interview === undefined) {
      throw new StoryKeeperError('INTERVIEW_NOT_FOUND', 'The interview was not found.');
    }
    if (
      this.interviews.findActiveFamilyMember(familyId, interview.narratorPersonId) === undefined
    ) {
      throw new StoryKeeperError(
        'PERSON_NOT_IN_FAMILY',
        'The interview narrator is not an active member of this family.',
      );
    }
    return interview;
  }
}

export function phraseConflictQuestion(conflict: NarratorConflictRecord): string {
  if (conflict.left.kind === 'fact' && conflict.right.kind === 'fact') {
    const subject = humanizeToken(conflict.left.factType);
    return `I remember you mentioning both “${conflict.left.value}” and “${conflict.right.value}” for ${subject}. Which fits best, or were these different situations?`;
  }
  if (conflict.left.kind === 'timeline_event' && conflict.right.kind === 'timeline_event') {
    return `I remember you mentioning ${formatApproximateDate(conflict.left.date)} and ${formatApproximateDate(conflict.right.date)} for “${conflict.left.title}”. Were these different events, or does one time fit better?`;
  }
  throw new Error('A contradiction must contain claims of the same supported type.');
}

function toPublicConflict(conflict: NarratorConflictRecord): PublicPendingConflict {
  return {
    contradictionId: conflict.id,
    contradictionType: conflict.type,
    status: 'unresolved',
    left: toPublicClaim(conflict.left),
    right: toPublicClaim(conflict.right),
    suggestedQuestion: phraseConflictQuestion(conflict),
  };
}

function toPublicClaim(claim: ConflictClaimRecord): PublicConflictClaim {
  if (claim.kind === 'fact') {
    return {
      kind: claim.kind,
      itemId: claim.itemId,
      factType: claim.factType,
      value: claim.value,
      status: claim.status,
      sourceAnswerIds: claim.sourceAnswerIds,
    };
  }
  return {
    kind: claim.kind,
    itemId: claim.itemId,
    eventType: claim.eventType,
    title: claim.title,
    description: claim.description,
    date: claim.date,
    status: claim.status,
    sourceAnswerIds: claim.sourceAnswerIds,
  };
}

function toResolveResult(record: ResolveConflictRecord): ResolveConflictResult {
  return {
    contradictionId: record.contradictionId,
    status: record.status,
    resolutionType: record.resolutionType,
    resolvedByPersonId: record.resolvedByPersonId,
    resolvedAt: record.resolvedAt.toISOString(),
  };
}

function formatApproximateDate(date: ApproximateDate): string {
  if (date.precision === 'unknown' || date.earliestYear === null || date.latestYear === null) {
    return 'an uncertain time';
  }
  if (date.precision === 'exact') return String(date.earliestYear);
  if (date.precision === 'approximate' && date.earliestYear === date.latestYear) {
    return `around ${String(date.earliestYear)}`;
  }
  if (date.precision === 'approximate') {
    return `around ${String(date.earliestYear)} to ${String(date.latestYear)}`;
  }
  return `between ${String(date.earliestYear)} and ${String(date.latestYear)}`;
}

function humanizeToken(value: string): string {
  return value.replaceAll('_', ' ').trim();
}
