// @vitest-environment happy-dom

import type { StoryKeeperClient } from '@story-keeper/mcp-client';
import {
  approvedChaptersResponseSchema,
  storyKeeperDemoIds,
  type ApprovedChaptersResponse,
} from '@story-keeper/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChapterReviewApp } from './ChapterReviewApp.js';
import { approvedChaptersFixture } from './fixture.js';
import './test-setup.js';

describe('ChapterReviewApp', () => {
  it('uses a fixture that validates against the approved chapter contract', () => {
    expect(approvedChaptersResponseSchema.safeParse(approvedChaptersFixture).success).toBe(true);
  });

  it('loads canonical approved chapters and preserves backend order', async () => {
    const firstChapter = approvedChaptersFixture.chapters[0];
    if (firstChapter === undefined) throw new Error('Expected an approved chapter fixture.');
    const secondChapter = {
      ...firstChapter,
      chapterId: '4a000000-0000-4000-8000-000000000002',
      title: 'A second approved chapter',
    };
    const response = {
      chapters: [secondChapter, ...approvedChaptersFixture.chapters],
    } satisfies ApprovedChaptersResponse;
    const client = createClient(response);
    render(<ChapterReviewApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load chapters' }));

    await screen.findByText('Approved chapters loaded from Story Keeper.');
    expect(client.getApprovedChapters).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.mayaPersonId,
    });
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('A second approved chapter'),
      expect.stringContaining('The House on Marigold Lane'),
    ]);
    expect(screen.queryByRole('button', { name: /approve|reject|request changes/i })).toBeNull();
  });

  it('renders long Unicode chapter text, empty state, and safe errors', async () => {
    const firstChapter = approvedChaptersFixture.chapters[0];
    if (firstChapter === undefined) throw new Error('Expected an approved chapter fixture.');
    const longTitle = `Élodie’s 長い章 ${'title'.repeat(40)}`;
    const longBody = `${'家族の記憶 '.repeat(120)}<script>not markup</script>`;
    const response: ApprovedChaptersResponse = {
      chapters: [
        {
          ...firstChapter,
          title: longTitle,
          body: longBody,
        },
      ],
    };
    const { container, unmount } = render(
      <ChapterReviewApp createClient={() => createClient(response)} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load chapters' }));
    expect(await screen.findByText(longTitle)).toBeVisible();
    expect(screen.getByText(longBody)).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    unmount();

    const emptyView = render(
      <ChapterReviewApp createClient={() => createClient({ chapters: [] })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load chapters' }));
    expect(await screen.findByText('No approved family chapters are available yet.')).toBeVisible();
    emptyView.unmount();

    const failureClient = createClient(response);
    failureClient.reconnect = vi.fn(() => Promise.reject(new Error('private/path/chapter.sqlite')));
    render(<ChapterReviewApp createClient={() => failureClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load chapters' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Approved chapters could not be loaded. Try again.',
    );
    expect(screen.queryByText(/private\/path|sqlite/i)).not.toBeInTheDocument();
  });
});

function createClient(response: ApprovedChaptersResponse) {
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
    getFamilyGraph: vi.fn<StoryKeeperClient['getFamilyGraph']>(() =>
      Promise.resolve({ nodes: [], edges: [] }),
    ),
    getApprovedChapters: vi.fn<StoryKeeperClient['getApprovedChapters']>(() =>
      Promise.resolve(response),
    ),
    searchFamilyStory: vi.fn<StoryKeeperClient['searchFamilyStory']>(() =>
      Promise.resolve({ results: [] }),
    ),
  } satisfies StoryKeeperClient;
}
