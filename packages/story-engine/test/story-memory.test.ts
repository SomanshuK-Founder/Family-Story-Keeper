import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scoreNameMatch } from '../src/name-matching.js';
import {
  areDateRangesClearlyIncompatible,
  compareApproximateDates,
  dateRangesOverlap,
  detectFactContradiction,
  detectTimelineDateContradiction,
  normalizeRelationshipType,
  validateApproximateDate,
} from '../src/story-memory.js';

describe('name match candidates', () => {
  it.each([
    ['Raj', 'Raj', 'exact'],
    ['Raj', 'Rajan', 'possible'],
    ['Raj Sharma', 'Raj Sharma', 'exact'],
    ['Raj', 'Meera', 'unlikely'],
  ] as const)(
    'scores %s vs %s as %s without changing either candidate',
    (leftName, rightName, expected) => {
      const left = { id: randomUUID(), name: leftName };
      const right = { id: randomUUID(), name: rightName };

      const result = scoreNameMatch(left, right);

      expect(result.classification).toBe(expected);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.left).toBe(left);
      expect(result.right).toBe(right);
    },
  );
});

describe('controlled relationships', () => {
  it('normalizes an allowed relationship and rejects an unknown type', () => {
    expect(normalizeRelationshipType(' Sibling ')).toBe('sibling');
    expect(() => normalizeRelationshipType('guardian')).toThrow();
  });
});

describe('approximate dates', () => {
  const exact1962 = { earliestYear: 1962, latestYear: 1962, precision: 'exact' } as const;
  const exact1964 = { earliestYear: 1964, latestYear: 1964, precision: 'exact' } as const;
  const range = { earliestYear: 1962, latestYear: 1964, precision: 'range' } as const;

  it('validates exact, approximate, range, and unknown representations', () => {
    expect(validateApproximateDate(exact1962)).toEqual(exact1962);
    expect(
      validateApproximateDate({
        earliestYear: 1962,
        latestYear: 1964,
        precision: 'approximate',
      }),
    ).toEqual({ earliestYear: 1962, latestYear: 1964, precision: 'approximate' });
    expect(validateApproximateDate(range)).toEqual(range);
    expect(
      validateApproximateDate({ earliestYear: null, latestYear: null, precision: 'unknown' }),
    ).toEqual({ earliestYear: null, latestYear: null, precision: 'unknown' });
  });

  it('detects overlap and clearly incompatible ranges without inventing precision', () => {
    expect(dateRangesOverlap(range, exact1964)).toBe(true);
    expect(compareApproximateDates(range, exact1964)).toBe('overlap');
    expect(areDateRangesClearlyIncompatible(exact1962, exact1964)).toBe(true);
    expect(compareApproximateDates(exact1962, exact1964)).toBe('incompatible');
  });

  it('rejects reversed ranges', () => {
    expect(() =>
      validateApproximateDate({ earliestYear: 1964, latestYear: 1962, precision: 'range' }),
    ).toThrow();
  });
});

describe('deterministic contradiction candidates', () => {
  it('identifies different values for the same conceptual fact', () => {
    const left = { id: randomUUID(), conceptKey: 'move_year', normalizedValue: '1962' };
    const right = { id: randomUUID(), conceptKey: 'move_year', normalizedValue: '1964' };

    expect(detectFactContradiction(left, right)).toEqual({
      type: 'fact_value',
      leftFactId: left.id,
      rightFactId: right.id,
    });
    expect(detectFactContradiction(left, { ...right, normalizedValue: '1962' })).toBeUndefined();
    expect(detectFactContradiction(left, { ...right, conceptKey: 'birth_year' })).toBeUndefined();
  });

  it('flags incompatible event dates but not overlapping ranges', () => {
    const left = {
      id: randomUUID(),
      conceptKey: 'move-to-pune',
      date: { earliestYear: 1962, latestYear: 1962, precision: 'exact' } as const,
    };
    const incompatible = {
      id: randomUUID(),
      conceptKey: 'move-to-pune',
      date: { earliestYear: 1964, latestYear: 1964, precision: 'exact' } as const,
    };
    const overlapping = {
      ...incompatible,
      date: { earliestYear: 1962, latestYear: 1964, precision: 'range' } as const,
    };

    expect(detectTimelineDateContradiction(left, incompatible)).toEqual({
      type: 'timeline_date',
      leftTimelineEventId: left.id,
      rightTimelineEventId: incompatible.id,
    });
    expect(detectTimelineDateContradiction(left, overlapping)).toBeUndefined();
  });
});
