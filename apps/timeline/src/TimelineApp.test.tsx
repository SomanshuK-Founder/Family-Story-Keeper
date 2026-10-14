// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import type { StoryKeeperClient } from '@story-keeper/mcp-client';
import { timelineResponseSchema, type TimelineResponse } from '@story-keeper/shared';
import { describe, expect, it } from 'vitest';
import { TimelineApp } from './TimelineApp.js';
import { timelineFixture } from './fixture.js';
import './test-setup.js';

describe('timeline fixture', () => {
  it('validates against the frozen shared response schema', () => {
    expect(timelineResponseSchema.safeParse(timelineFixture).success).toBe(true);
  });

  it('renders exact, approximate, range, and unknown dates without inventing precision', async () => {
    render(<TimelineApp createClient={() => createClient(timelineFixture)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load timeline' }));
    await screen.findByText('Timeline loaded from Story Keeper.');
    expect(screen.getByText('1942')).toBeInTheDocument();
    expect(screen.getByText('Around 1955')).toBeInTheDocument();
    expect(screen.getByText('1958\u20131962')).toBeInTheDocument();
    expect(screen.getByText('Date unknown')).toBeInTheDocument();
  });

  it('renders an approved-only empty response and preserves backend order', async () => {
    const later = timelineFixture.items[2];
    const earlier = timelineFixture.items[0];
    if (later === undefined || earlier === undefined)
      throw new Error('Expected timeline fixtures.');
    const ordered = { items: [later, earlier] };
    render(<TimelineApp createClient={() => createClient(ordered)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load timeline' }));
    await screen.findByText('Timeline loaded from Story Keeper.');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Attended secondary school'),
      expect.stringContaining('Rosa was born'),
    ]);
  });

  it('renders the approved timeline empty state', async () => {
    render(<TimelineApp createClient={() => createClient({ items: [] })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect and load timeline' }));
    expect(
      await screen.findByText('No approved family events are available yet.'),
    ).toBeInTheDocument();
  });

  it('shows an explicit error instead of timeline mock data when MCP is unavailable', async () => {
    const client = createClient(timelineFixture);
    client.reconnect = () => Promise.reject(new Error('private transport detail'));
    render(<TimelineApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect and load timeline' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The family timeline could not be loaded. Try again.',
    );
    expect(screen.queryByText('Rosa was born')).not.toBeInTheDocument();
  });
});

function createClient(timeline: TimelineResponse): StoryKeeperClient {
  return {
    connect: () => Promise.resolve([]),
    reconnect: () => Promise.resolve([]),
    disconnect: () => Promise.resolve(),
    startInterview: () => Promise.reject(new Error('Not used')),
    getNextQuestion: () => Promise.reject(new Error('Not used')),
    saveAnswer: () => Promise.reject(new Error('Not used')),
    getStoryContext: () => Promise.reject(new Error('Not used')),
    listPendingConflicts: () => Promise.reject(new Error('Not used')),
    getTimeline: () => Promise.resolve(timeline),
  };
}
