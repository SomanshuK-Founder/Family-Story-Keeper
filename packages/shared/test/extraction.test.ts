import { describe, expect, it } from 'vitest';

import { storyExtractionSchema } from '../src/extraction.js';

const emptyExtraction = {
  people: [],
  relationships: [],
  events: [],
  places: [],
  dateMentions: [],
  factCandidates: [],
  followUpCandidates: [],
};

describe('storyExtractionSchema', () => {
  it('accepts an empty grounded extraction', () => {
    expect(storyExtractionSchema.parse(emptyExtraction)).toEqual(emptyExtraction);
  });

  it('rejects missing collections and unknown fields', () => {
    expect(() => storyExtractionSchema.parse({ people: [] })).toThrow();
    expect(() => storyExtractionSchema.parse({ ...emptyExtraction, unsupported: [] })).toThrow();
  });

  it('rejects unsupported relationships and invalid date ranges', () => {
    expect(() =>
      storyExtractionSchema.parse({
        ...emptyExtraction,
        relationships: [
          {
            fromReference: 'narrator',
            toReference: 'raj',
            relationshipType: 'guardian',
            confidence: 0.8,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      storyExtractionSchema.parse({
        ...emptyExtraction,
        events: [
          {
            subjectReference: 'narrator',
            eventType: 'move',
            title: 'Moved',
            description: '',
            date: { earliestYear: 1964, latestYear: 1962, precision: 'range' },
            confidence: 0.8,
          },
        ],
      }),
    ).toThrow();
  });
});
