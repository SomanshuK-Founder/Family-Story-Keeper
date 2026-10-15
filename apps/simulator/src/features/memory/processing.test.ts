import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import { describe, expect, it } from 'vitest';

import { captureMemoryItemIds, findNewPendingMemoryIds } from './processing.js';

const rosaPersonId = '00000000-0000-4000-8000-000000000002';
const rajPersonId = '00000000-0000-4000-8000-000000000008';

const baseContext: GetStoryContextResult = {
  actor: { id: rosaPersonId, displayName: 'Rosa', role: 'narrator' },
  visibility: 'narrator_review',
  personIdentities: [{ personId: rosaPersonId, status: 'confirmed', displayName: 'Rosa' }],
  facts: [],
  relationships: [],
  timelineEvents: [],
  chapters: [],
  conflicts: [],
};

describe('memory processing identity tracking', () => {
  it('treats a new unresolved identity as available structured memory', () => {
    const nextContext: GetStoryContextResult = {
      ...baseContext,
      personIdentities: [
        ...(baseContext.personIdentities ?? []),
        {
          personId: rajPersonId,
          status: 'unresolved',
          extractedDisplayName: 'Raj',
          possibleMatchDisplayName: null,
        },
      ],
    };

    expect(findNewPendingMemoryIds(nextContext, captureMemoryItemIds(baseContext))).toEqual(
      new Set([rajPersonId]),
    );
  });

  it('does not treat a newly returned confirmed reference as pending ambiguity', () => {
    const nextContext: GetStoryContextResult = {
      ...baseContext,
      personIdentities: [
        ...(baseContext.personIdentities ?? []),
        { personId: rajPersonId, status: 'confirmed', displayName: 'Raj' },
      ],
    };

    expect(findNewPendingMemoryIds(nextContext, captureMemoryItemIds(baseContext))).toEqual(
      new Set(),
    );
  });
});
