// @vitest-environment happy-dom

import type { StoryKeeperClient } from '@story-keeper/mcp-client';
import {
  familyGraphResponseSchema,
  storyKeeperDemoIds,
  type FamilyGraphResponse,
} from '@story-keeper/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FamilyTreeApp } from './FamilyTreeApp.js';
import { familyGraphFixture } from './fixture.js';
import './test-setup.js';

describe('FamilyTreeApp', () => {
  it('uses a fixture that validates against the frozen shared graph schema', () => {
    expect(familyGraphResponseSchema.safeParse(familyGraphFixture).success).toBe(true);
  });

  it('loads the canonical graph, preserves returned order, and renders confirmed identities', async () => {
    const client = createClient(familyGraphFixture);
    render(<FamilyTreeApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load family tree' }));

    await screen.findByText('Family tree loaded from Story Keeper.');
    expect(client.getFamilyGraph).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.mayaPersonId,
    });
    expect(
      screen
        .getAllByRole('listitem')
        .slice(0, 3)
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Rosa'),
      expect.stringContaining('Maya'),
      expect.stringContaining('Arun'),
    ]);
    expect(screen.getAllByText(/Parent/)).toHaveLength(2);
  });

  it('handles empty, long Unicode, and safe backend-error states', async () => {
    const longName = `Élodie O’Connor ${'長'.repeat(120)}`;
    const graph: FamilyGraphResponse = {
      nodes: [
        {
          personId: '2a000000-0000-4000-8000-000000000099',
          displayName: longName,
          role: 'relative',
          status: 'active',
        },
      ],
      edges: [],
    };
    const { unmount } = render(<FamilyTreeApp createClient={() => createClient(graph)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load family tree' }));
    expect(await screen.findByText(longName)).toBeVisible();
    expect(screen.getByText('No approved relationships are available.')).toBeVisible();
    unmount();

    const emptyView = render(
      <FamilyTreeApp createClient={() => createClient({ nodes: [], edges: [] })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load family tree' }));
    expect(
      await screen.findByText('No approved family relationships are available yet.'),
    ).toBeVisible();
    emptyView.unmount();

    const failureClient = createClient(graph);
    failureClient.reconnect = vi.fn(() => Promise.reject(new Error('private/path/family.sqlite')));
    render(<FamilyTreeApp createClient={() => failureClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load family tree' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The family tree could not be loaded. Try again.',
    );
    expect(screen.queryByText(/private\/path|sqlite/i)).not.toBeInTheDocument();
  });
});

function createClient(graph: FamilyGraphResponse) {
  return {
    connect: vi.fn(() => Promise.resolve([])),
    reconnect: vi.fn(() => Promise.resolve([])),
    disconnect: vi.fn(() => Promise.resolve()),
    startInterview: vi.fn<StoryKeeperClient['startInterview']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    getNextQuestion: vi.fn<StoryKeeperClient['getNextQuestion']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    saveAnswer: vi.fn<StoryKeeperClient['saveAnswer']>(() => Promise.reject(new Error('Not used'))),
    getStoryContext: vi.fn<StoryKeeperClient['getStoryContext']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    listPendingConflicts: vi.fn<StoryKeeperClient['listPendingConflicts']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    resolveConflict: vi.fn<StoryKeeperClient['resolveConflict']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    approveStoryItem: vi.fn<StoryKeeperClient['approveStoryItem']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    deletePendingMemory: vi.fn<StoryKeeperClient['deletePendingMemory']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    queueFamilyQuestion: vi.fn<StoryKeeperClient['queueFamilyQuestion']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    requestChapterDraft: vi.fn<StoryKeeperClient['requestChapterDraft']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    reviewChapter: vi.fn<StoryKeeperClient['reviewChapter']>(() =>
      Promise.reject(new Error('Not used')),
    ),
    getTimeline: vi.fn<StoryKeeperClient['getTimeline']>(() => Promise.resolve({ items: [] })),
    getFamilyGraph: vi.fn<StoryKeeperClient['getFamilyGraph']>(() => Promise.resolve(graph)),
    getApprovedChapters: vi.fn<StoryKeeperClient['getApprovedChapters']>(() =>
      Promise.resolve({ chapters: [] }),
    ),
    searchFamilyStory: vi.fn<StoryKeeperClient['searchFamilyStory']>(() =>
      Promise.resolve({ results: [] }),
    ),
  } satisfies StoryKeeperClient;
}
