// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ListPendingConflictsResult } from '@story-keeper/mcp-client';
import type { ContradictionResolutionType } from '@story-keeper/shared';
import { describe, expect, it, vi } from 'vitest';

import { ConflictReviewList } from './ConflictReviewList.js';
import '../../test-setup.js';

const answerId = '10000000-0000-4000-8000-000000000001';
const factConflict: ListPendingConflictsResult['conflicts'][number] = {
  contradictionId: '20000000-0000-4000-8000-000000000001',
  contradictionType: 'fact_value',
  status: 'unresolved',
  left: {
    kind: 'fact',
    itemId: '30000000-0000-4000-8000-000000000001',
    factType: 'move_year',
    value: '1962',
    status: 'pending',
    sourceAnswerIds: [answerId],
  },
  right: {
    kind: 'fact',
    itemId: '30000000-0000-4000-8000-000000000002',
    factType: 'move_year',
    value: '1964',
    status: 'pending',
    sourceAnswerIds: [answerId, '10000000-0000-4000-8000-000000000002'],
  },
  suggestedQuestion: 'Was the move in 1962 or 1964?',
};

const timelineConflict: ListPendingConflictsResult['conflicts'][number] = {
  contradictionId: '20000000-0000-4000-8000-000000000002',
  contradictionType: 'timeline_date',
  status: 'unresolved',
  left: {
    kind: 'timeline_event',
    itemId: '30000000-0000-4000-8000-000000000003',
    eventType: 'move',
    title: 'Moved to Delhi',
    description: 'First account of the move.',
    date: { earliestYear: 1962, latestYear: 1962, precision: 'approximate' },
    status: 'pending',
    sourceAnswerIds: [answerId],
  },
  right: {
    kind: 'timeline_event',
    itemId: '30000000-0000-4000-8000-000000000004',
    eventType: 'move',
    title: 'Moved to Delhi',
    description: 'Second account of the move.',
    date: { earliestYear: 1964, latestYear: 1964, precision: 'exact' },
    status: 'pending',
    sourceAnswerIds: [answerId],
  },
  suggestedQuestion: 'Were these different moves?',
};

describe('ConflictReviewList', () => {
  it('shows safe fact claims and requires confirmation before a destructive resolution', async () => {
    const onResolve = vi.fn<OnResolve>();
    renderConflict([factConflict], onResolve);

    const region = screen.getByRole('region', { name: 'Memories that need review' });
    expect(within(region).getByText('1962')).toBeInTheDocument();
    expect(within(region).getByText('1964')).toBeInTheDocument();
    expect(within(region).getAllByText('Pending memory')).toHaveLength(2);
    expect(within(region).queryByText('Approved')).not.toBeInTheDocument();
    expect(
      within(region).queryByRole('button', { name: 'These were different events' }),
    ).not.toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'These do not conflict' })).toBeEnabled();

    for (const disclosure of within(region).getAllByText('Source details')) disclosure.click();
    expect(within(region).getByText('Supported by 1 interview source.')).toBeInTheDocument();
    expect(within(region).getByText('Supported by 2 interview sources.')).toBeInTheDocument();
    expect(region).not.toHaveTextContent(answerId);

    const keepFirst = within(region).getByRole('button', { name: 'Keep the first memory' });
    fireEvent.click(keepFirst);
    expect(onResolve).not.toHaveBeenCalled();
    const confirmation = within(region).getByText('Keep the first memory?').parentElement;
    expect(confirmation).not.toBeNull();
    expect(document.activeElement).toBe(confirmation);
    expect(
      within(region).getByText(/second pending memory will be marked rejected/i),
    ).toBeVisible();
    expect(within(region).getByText(/does not approve either memory/i)).toBeVisible();

    if (confirmation === null) throw new Error('Expected confirmation.');
    fireEvent.keyDown(confirmation, { key: 'Escape' });
    await waitFor(() => expect(keepFirst).toHaveFocus());
    fireEvent.click(keepFirst);
    fireEvent.click(within(region).getByRole('button', { name: 'Confirm: Keep the first memory' }));
    expect(onResolve).toHaveBeenCalledWith(factConflict.contradictionId, 'keep_left');
  });

  it('offers timeline-only different-events and explains non-destructive choices', () => {
    const onResolve = vi.fn<OnResolve>();
    renderConflict([timelineConflict], onResolve);
    const region = screen.getByRole('region', { name: 'Memories that need review' });

    expect(within(region).getByText('Around 1962')).toBeInTheDocument();
    expect(within(region).getByText('1964')).toBeInTheDocument();
    fireEvent.click(within(region).getByRole('button', { name: 'These were different events' }));
    expect(within(region).getByText(/Both timeline memories will remain/i)).toBeVisible();
    fireEvent.click(
      within(region).getByRole('button', { name: 'Confirm: These were different events' }),
    );
    expect(onResolve).toHaveBeenCalledWith(timelineConflict.contradictionId, 'different_events');
  });

  it('communicates submitting and empty states without implying approval', () => {
    const { rerender } = render(
      <ConflictReviewList
        conflicts={[factConflict]}
        connected
        interviewReady
        loading={false}
        activeResolution={{
          contradictionId: factConflict.contradictionId,
          resolutionType: 'dismiss_not_a_conflict',
        }}
        notice={null}
        onResolve={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(
      true,
    );
    rerender(
      <ConflictReviewList
        conflicts={[]}
        connected
        interviewReady
        loading={false}
        activeResolution={null}
        notice={null}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByText('No memories need conflict review right now.')).toBeInTheDocument();
    expect(screen.queryByText(/all memories are approved/i)).not.toBeInTheDocument();
  });
});

function renderConflict(
  conflicts: ListPendingConflictsResult['conflicts'],
  onResolve: OnResolve,
): void {
  render(
    <ConflictReviewList
      conflicts={conflicts}
      connected
      interviewReady
      loading={false}
      activeResolution={null}
      notice={null}
      onResolve={onResolve}
    />,
  );
}

type OnResolve = (contradictionId: string, resolutionType: ContradictionResolutionType) => void;
