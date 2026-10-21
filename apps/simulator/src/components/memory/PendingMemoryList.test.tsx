// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import { storyKeeperDemoIds } from '@story-keeper/shared';

import { PendingMemoryList } from './PendingMemoryList.js';
import '../../test-setup.js';

const context: GetStoryContextResult = {
  actor: { id: storyKeeperDemoIds.rosaPersonId, displayName: 'Rosa', role: 'narrator' },
  visibility: 'narrator_review',
  personIdentities: [
    {
      personId: storyKeeperDemoIds.rosaPersonId,
      status: 'confirmed',
      displayName: 'Rosa',
    },
    {
      personId: storyKeeperDemoIds.mayaPersonId,
      status: 'confirmed',
      displayName: 'Maya',
    },
    {
      personId: '10000000-0000-4000-8000-000000000010',
      status: 'unresolved',
      extractedDisplayName: 'Raj',
      possibleMatchDisplayName: 'Raj Sharma',
    },
    {
      personId: '10000000-0000-4000-8000-000000000011',
      status: 'unresolved',
      extractedDisplayName: 'Raj',
      possibleMatchDisplayName: null,
    },
  ],
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
    {
      id: '10000000-0000-4000-8000-000000000004',
      fromPersonId: storyKeeperDemoIds.rosaPersonId,
      toPersonId: '10000000-0000-4000-8000-000000000010',
      relationshipType: 'sibling',
      confidence: 0.9,
      status: 'pending',
      sourceCount: 1,
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
  it('keeps identity, relationship, date, approval, and provenance semantics distinct', () => {
    const onMutate = vi.fn();
    render(
      <PendingMemoryList
        context={context}
        highlightedIds={new Set(context.facts.map((fact) => fact.id))}
        connected
        loading={false}
        canManage
        activeMutation={null}
        notice={null}
        onMutate={onMutate}
      />,
    );

    const region = screen.getByRole('region', { name: 'Review story memories' });
    expect(within(region).getByText('The garden by the old market')).toBeInTheDocument();
    expect(
      within(region).getByRole('heading', { name: 'Needs clarification' }),
    ).toBeInTheDocument();
    expect(within(region).getAllByText('Person needs clarification')).toHaveLength(2);
    expect(within(region).getByText('Possible person')).toBeInTheDocument();
    expect(within(region).getByText('Raj Sharma')).toBeInTheDocument();
    expect(within(region).getByText(/No confirmed match has been selected/)).toBeInTheDocument();
    expect(within(region).getAllByText('Pending relationship')).toHaveLength(2);
    expect(within(region).getByText(/Both people are confirmed references/)).toBeInTheDocument();
    expect(within(region).getByText(/person reference needs clarification/)).toBeInTheDocument();
    expect(within(region).getAllByText('Confirmed person').length).toBeGreaterThan(0);
    expect(within(region).getByText('Identity needs clarification')).toBeInTheDocument();
    expect(within(region).getByText('Around 1964')).toBeInTheDocument();
    expect(within(region).getAllByText('Source details')).toHaveLength(4);

    for (const disclosure of within(region).getAllByText('Source details')) {
      disclosure.click();
    }
    expect(within(region).getAllByText('Supported by 1 interview source.')).toHaveLength(3);
    expect(within(region).getByText('Supported by 2 interview sources.')).toBeInTheDocument();
    expect(region).not.toHaveTextContent('From Rosa’s interview');
    expect(within(region).getByRole('button', { name: 'Approve Favorite place' })).toBeEnabled();
    expect(
      within(region).getByRole('button', { name: 'Approve Child relationship' }),
    ).toBeEnabled();
    expect(
      within(region).getByRole('button', { name: 'Approve Sibling relationship' }),
    ).toBeDisabled();
    expect(
      within(region).getByText(/cannot be approved until both person references are confirmed/i),
    ).toBeInTheDocument();
    expect(
      within(region).queryByRole('button', { name: /merge|select identity|resolve identity/i }),
    ).not.toBeInTheDocument();
    expect(region).not.toHaveTextContent(storyKeeperDemoIds.rosaPersonId);
    expect(region).not.toHaveTextContent(storyKeeperDemoIds.mayaPersonId);
    expect(region).not.toHaveTextContent('raw answer');
    expect(region).not.toHaveTextContent('provider response');
  });

  it('does not infer identity when the additive field is absent', () => {
    const legacyContext: GetStoryContextResult = { ...context, personIdentities: undefined };
    render(
      <PendingMemoryList
        context={legacyContext}
        highlightedIds={new Set()}
        connected
        loading={false}
        canManage
        activeMutation={null}
        notice={null}
        onMutate={vi.fn()}
      />,
    );

    const region = screen.getByRole('region', { name: 'Review story memories' });
    expect(
      within(region).queryByRole('heading', { name: 'Needs clarification' }),
    ).not.toBeInTheDocument();
    expect(within(region).getAllByText('Identity details unavailable').length).toBeGreaterThan(0);
    expect(within(region).queryByText('Confirmed person')).not.toBeInTheDocument();
  });

  it('confirms destructive actions, restores focus on cancel, and submits exact actions', async () => {
    const onMutate = vi.fn();
    render(
      <PendingMemoryList
        context={context}
        highlightedIds={new Set()}
        connected
        loading={false}
        canManage
        activeMutation={null}
        notice={null}
        onMutate={onMutate}
      />,
    );

    const reject = screen.getByRole('button', { name: 'Reject Favorite place' });
    fireEvent.click(reject);
    const confirmation = screen.getByRole('heading', {
      name: 'Reject Favorite place?',
    }).parentElement;
    expect(confirmation).not.toBeNull();
    expect(document.activeElement).toBe(confirmation);
    expect(screen.getByText(/marked rejected/i)).toBeVisible();
    expect(screen.getByText(/original interview answer and source history/i)).toBeVisible();
    if (confirmation === null) throw new Error('Expected confirmation.');
    fireEvent.keyDown(confirmation, { key: 'Escape' });
    await waitFor(() => expect(reject).toHaveFocus());

    fireEvent.click(reject);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection for Favorite place' }));
    expect(onMutate).toHaveBeenCalledWith('fact', context.facts[0]?.id, 'reject');

    fireEvent.click(screen.getByRole('button', { name: 'Remove pending memory Favorite place' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm pending memory removal for Favorite place' }),
    );
    expect(onMutate).toHaveBeenCalledWith('fact', context.facts[0]?.id, 'remove');
  });

  it('confirms revocation with preserved-source copy and exposes textual progress', () => {
    const approvedFact = context.facts[0];
    if (approvedFact === undefined) throw new Error('Expected the fixture to include a fact.');
    const approvedContext: GetStoryContextResult = {
      ...context,
      facts: [{ ...approvedFact, status: 'approved' }],
      relationships: [],
      timelineEvents: [],
    };
    const onMutate = vi.fn();
    const { rerender } = render(
      <PendingMemoryList
        context={approvedContext}
        highlightedIds={new Set()}
        connected
        loading={false}
        canManage
        activeMutation={null}
        notice={null}
        onMutate={onMutate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revoke approval for Favorite place' }));
    expect(
      screen.getByRole('heading', { name: 'Revoke approval for Favorite place?' }),
    ).toBeVisible();
    expect(screen.getByText(/stop appearing in approved family views/i)).toBeVisible();
    expect(screen.getByText(/source history will remain preserved/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revocation for Favorite place' }));
    expect(onMutate).toHaveBeenCalledWith('fact', approvedFact.id, 'revoke');

    rerender(
      <PendingMemoryList
        context={approvedContext}
        highlightedIds={new Set()}
        connected
        loading={false}
        canManage
        activeMutation={{ targetType: 'fact', targetId: approvedFact.id, action: 'revoke' }}
        notice={null}
        onMutate={onMutate}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Revoking approval…');
    expect(
      screen.getByRole('button', { name: 'Revoke approval for Favorite place' }),
    ).toBeDisabled();
  });

  it('shows approved family memory without narrator controls', () => {
    const approvedContext: GetStoryContextResult = {
      ...context,
      actor: { id: storyKeeperDemoIds.mayaPersonId, displayName: 'Maya', role: 'relative' },
      visibility: 'approved_family',
      personIdentities: [],
      facts: context.facts.map((fact) => ({ ...fact, status: 'approved' as const })),
      relationships: [],
      timelineEvents: [],
    };
    render(
      <PendingMemoryList
        context={approvedContext}
        highlightedIds={new Set()}
        connected
        loading={false}
        canManage={false}
        activeMutation={null}
        notice={null}
        onMutate={vi.fn()}
      />,
    );

    const region = screen.getByRole('region', { name: 'Approved family memories' });
    expect(within(region).getByText('Approved memory')).toBeVisible();
    expect(within(region).getByText('The garden by the old market')).toBeVisible();
    expect(
      within(region).queryByRole('button', { name: /approve|reject|revoke|remove/i }),
    ).toBeNull();
  });
});
