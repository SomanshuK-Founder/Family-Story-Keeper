import { randomUUID } from 'node:crypto';

import {
  approvedChaptersResponseSchema,
  familyGraphResponseSchema,
  presentationReadInputSchema,
  storyContextPersonIdentitySchema,
  timelineResponseSchema,
} from '@story-keeper/shared';
import { describe, expect, it } from 'vitest';

describe('Phase 8 presentation contracts', () => {
  it('validates strict actor-scoped inputs and critical response fields', () => {
    const familyId = randomUUID();
    const actorPersonId = randomUUID();
    expect(presentationReadInputSchema.parse({ familyId, actorPersonId })).toEqual({
      familyId,
      actorPersonId,
    });
    expect(() =>
      presentationReadInputSchema.parse({ familyId, actorPersonId, extra: true }),
    ).toThrow();

    const eventId = randomUUID();
    expect(
      timelineResponseSchema.parse({
        items: [
          {
            id: eventId,
            eventType: 'move',
            title: 'Moved to Delhi',
            description: 'A remembered move.',
            personId: actorPersonId,
            personDisplayName: 'Rosa',
            date: { earliestYear: 1962, latestYear: 1964, precision: 'approximate' },
            status: 'approved',
            sourceCount: 1,
          },
        ],
      }).items[0]?.date,
    ).toEqual({ earliestYear: 1962, latestYear: 1964, precision: 'approximate' });

    expect(familyGraphResponseSchema.parse({ nodes: [], edges: [] })).toEqual({
      nodes: [],
      edges: [],
    });
    expect(
      approvedChaptersResponseSchema.parse({
        chapters: [
          {
            chapterId: randomUUID(),
            title: 'A Delhi Childhood',
            body: 'A grounded chapter body.',
            narratorPersonId: actorPersonId,
            narratorDisplayName: 'Rosa',
            approvedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
            sourceCount: 2,
          },
        ],
      }).chapters,
    ).toHaveLength(1);
  });

  it('validates safe confirmed and unresolved identity references without internal metadata', () => {
    const confirmedPersonId = randomUUID();
    const unresolvedPersonId = randomUUID();

    expect(
      storyContextPersonIdentitySchema.parse({
        personId: confirmedPersonId,
        status: 'confirmed',
        displayName: 'Raj Sharma',
      }),
    ).toEqual({ personId: confirmedPersonId, status: 'confirmed', displayName: 'Raj Sharma' });
    expect(
      storyContextPersonIdentitySchema.parse({
        personId: unresolvedPersonId,
        status: 'unresolved',
        extractedDisplayName: 'Raj',
        possibleMatchDisplayName: null,
      }),
    ).toEqual({
      personId: unresolvedPersonId,
      status: 'unresolved',
      extractedDisplayName: 'Raj',
      possibleMatchDisplayName: null,
    });
    expect(() =>
      storyContextPersonIdentitySchema.parse({
        personId: unresolvedPersonId,
        status: 'unresolved',
        extractedDisplayName: 'Raj',
        possibleMatchDisplayName: 'Raj Sharma',
        matchScore: 1,
      }),
    ).toThrow();
  });
});
