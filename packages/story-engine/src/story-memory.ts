import {
  approximateDateSchema,
  relationshipTypeSchema,
  type ApproximateDate,
  type RelationshipType,
} from '@story-keeper/shared';

export type DateComparison = 'overlap' | 'incompatible' | 'unknown';

export interface ComparableFact {
  readonly id: string;
  readonly conceptKey: string;
  readonly normalizedValue: string;
}

export interface ComparableTimelineEvent {
  readonly id: string;
  readonly conceptKey: string;
  readonly date: ApproximateDate;
}

export type PotentialContradiction =
  | {
      readonly type: 'fact_value';
      readonly leftFactId: string;
      readonly rightFactId: string;
    }
  | {
      readonly type: 'timeline_date';
      readonly leftTimelineEventId: string;
      readonly rightTimelineEventId: string;
    };

export function normalizeRelationshipType(value: string): RelationshipType {
  return relationshipTypeSchema.parse(value.trim().toLocaleLowerCase('en'));
}

export function validateApproximateDate(value: unknown): ApproximateDate {
  return approximateDateSchema.parse(value);
}

export function compareApproximateDates(
  leftValue: ApproximateDate,
  rightValue: ApproximateDate,
): DateComparison {
  const left = approximateDateSchema.parse(leftValue);
  const right = approximateDateSchema.parse(rightValue);

  if (
    left.earliestYear === null ||
    left.latestYear === null ||
    right.earliestYear === null ||
    right.latestYear === null
  ) {
    return 'unknown';
  }

  return left.earliestYear <= right.latestYear && right.earliestYear <= left.latestYear
    ? 'overlap'
    : 'incompatible';
}

export function dateRangesOverlap(left: ApproximateDate, right: ApproximateDate): boolean | null {
  const comparison = compareApproximateDates(left, right);
  return comparison === 'unknown' ? null : comparison === 'overlap';
}

export function areDateRangesClearlyIncompatible(
  left: ApproximateDate,
  right: ApproximateDate,
): boolean {
  return compareApproximateDates(left, right) === 'incompatible';
}

export function detectFactContradiction(
  left: ComparableFact,
  right: ComparableFact,
): PotentialContradiction | undefined {
  if (
    normalizeConcept(left.conceptKey) !== normalizeConcept(right.conceptKey) ||
    normalizeValue(left.normalizedValue) === normalizeValue(right.normalizedValue)
  ) {
    return undefined;
  }

  return { type: 'fact_value', leftFactId: left.id, rightFactId: right.id };
}

export function detectTimelineDateContradiction(
  left: ComparableTimelineEvent,
  right: ComparableTimelineEvent,
): PotentialContradiction | undefined {
  if (
    normalizeConcept(left.conceptKey) !== normalizeConcept(right.conceptKey) ||
    !areDateRangesClearlyIncompatible(left.date, right.date)
  ) {
    return undefined;
  }

  return {
    type: 'timeline_date',
    leftTimelineEventId: left.id,
    rightTimelineEventId: right.id,
  };
}

function normalizeConcept(value: string): string {
  return value.trim().toLocaleLowerCase('en');
}

function normalizeValue(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en');
}
