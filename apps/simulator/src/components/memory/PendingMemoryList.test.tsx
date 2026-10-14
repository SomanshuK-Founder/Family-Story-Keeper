// @vitest-environment happy-dom

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import { storyKeeperDemoIds } from '@story-keeper/shared';

import { PendingMemoryList } from './PendingMemoryList.js';
import '../../test-setup.js';

const context: GetStoryContextResult = {
  actor: { id: storyKeeperDemoIds.rosaPersonId, displayName: 'Rosa', role: 'narrator' },
  visibility: 'narrator_review',
  facts: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      factType: 'favorite_place',
      value: 'The garden by the old market',
      confidence: 0.93,
      status: 'pending',
      sourceCount: 1,
    },
  ],
  relationships: [
    {
      id: '10000000-0000-4000-8000-000000000002',
      fromPersonId: storyKeeperDemoIds.rosaPersonId,
      toPersonId: storyKeeperDemoIds.mayaPersonId,
      relationshipType: 'child',
      confidence: 0.88,
      status: 'pending',
      sourceCount: 2,
    },
  ],
  timelineEvents: [
    {
      id: '10000000-0000-4000-8000-000000000003',
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      eventType: 'move',
      title: 'Moved near the old market',
      description: 'Rosa remembered the move.',
      date: { earliestYear: 1964, latestYear: 1964, precision: 'approximate' },
      status: 'pending',
      sourceCount: 1,
    },
  ],
  chapters: [],
  conflicts: [],
};

describe('PendingMemoryList', () => {
  it('renders typed pending cards, uncertainty, ambiguity, and safe provenance', () => {
    render(
      <PendingMemoryList
        context={context}
        highlightedIds={new Set(context.facts.map((fact) => fact.id))}
        connected
        loading={false}
      />,
    );

    const region = screen.getByRole('region', { name: 'Memories waiting for review' });
    expect(within(region).getByText('The garden by the old market')).toBeInTheDocument();
    expect(within(region).getByText('Pending relationship candidate')).toBeInTheDocument();
    expect(within(region).getByText('Around 1964')).toBeInTheDocument();
    expect(within(region).getAllByText('Source details')).toHaveLength(3);
    expect(within(region).getByText(/2 interview sources/)).toBeInTheDocument();
    expect(
      within(region).queryByRole('button', { name: /approve|reject|delete/i }),
    ).not.toBeInTheDocument();
    expect(region).not.toHaveTextContent(storyKeeperDemoIds.rosaPersonId);
    expect(region).not.toHaveTextContent(storyKeeperDemoIds.mayaPersonId);
  });
});
