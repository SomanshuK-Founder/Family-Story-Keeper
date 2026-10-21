// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChapterDraftPanel } from './ChapterDraftPanel.js';
import '../../test-setup.js';

const review = {
  chapterDraftId: '10000000-0000-4000-8000-000000000006',
  narratorPersonId: '00000000-0000-4000-8000-000000000002',
  chapterTopic: 'Rosa’s early years',
  title: 'Beside the Old Market',
  body: 'Rosa remembered the garden beside the market.',
  status: 'pending_review' as const,
  sources: [
    {
      type: 'fact' as const,
      sourceId: '50000000-0000-4000-8000-000000000001',
      label: 'Favorite place: The private garden',
      summary: 'Private structured source summary',
    },
  ],
};

describe('ChapterDraftPanel', () => {
  it('labels and validates the topic field without silently truncating it', () => {
    const onTopicChange = vi.fn();
    render(
      <ChapterDraftPanel
        narratorName="Rosa"
        connected
        topic={'x'.repeat(201)}
        status="idle"
        review={null}
        validationMessage="Enter a chapter topic between 1 and 200 characters."
        notice={null}
        confirmReject={false}
        onTopicChange={onTopicChange}
        onRequest={vi.fn()}
        onCheckStatus={vi.fn()}
        onApprove={vi.fn()}
        onOpenReject={vi.fn()}
        onCancelReject={vi.fn()}
        onConfirmReject={vi.fn()}
      />,
    );

    const topic = screen.getByLabelText('What should this chapter focus on?');
    expect(topic).toHaveValue('x'.repeat(201));
    expect(topic).not.toHaveAttribute('maxlength');
    expect(topic).toHaveAttribute('aria-invalid', 'true');
    expect(topic).toHaveAccessibleDescription(/1 and 200 characters/);
    expect(topic).toHaveFocus();
  });

  it('shows only safe review metadata and restores focus after cancelling rejection', async () => {
    function Harness() {
      const [confirmReject, setConfirmReject] = useState(false);
      return (
        <ChapterDraftPanel
          narratorName="Rosa"
          connected
          topic=""
          status="pending_review"
          review={review}
          validationMessage={null}
          notice={null}
          confirmReject={confirmReject}
          onTopicChange={vi.fn()}
          onRequest={vi.fn()}
          onCheckStatus={vi.fn()}
          onApprove={vi.fn()}
          onOpenReject={() => {
            setConfirmReject(true);
          }}
          onCancelReject={() => {
            setConfirmReject(false);
          }}
          onConfirmReject={vi.fn()}
        />
      );
    }
    render(<Harness />);

    expect(screen.getByRole('heading', { name: review.title })).toBeVisible();
    expect(screen.getByText(review.body)).toBeVisible();
    fireEvent.click(screen.getByText('Supported by 1 approved source'));
    expect(screen.getByText(/Favorite place: The private garden/)).toBeVisible();
    expect(screen.queryByText(review.sources[0]?.sourceId ?? '')).not.toBeInTheDocument();
    expect(screen.queryByText('Private structured source summary')).not.toBeInTheDocument();

    const reject = screen.getByRole('button', { name: 'Reject chapter' });
    fireEvent.click(reject);
    const confirmation = screen.getByRole('group', { name: 'Reject this chapter?' });
    expect(confirmation).toHaveFocus();
    expect(screen.getByText(/will not appear in family-visible story views/)).toBeVisible();
    expect(
      screen.getByText(/source memories and their history will remain preserved/),
    ).toBeVisible();
    fireEvent.keyDown(confirmation, { key: 'Escape' });
    await waitFor(() => {
      expect(reject).toHaveFocus();
    });
  });
});
