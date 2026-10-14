// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { approvedChaptersResponseSchema } from '@story-keeper/shared';
import { describe, expect, it } from 'vitest';
import { ChapterReviewApp } from './ChapterReviewApp.js';
import { approvedChaptersFixture } from './fixture.js';
import './test-setup.js';

describe('ChapterReviewApp', () => {
  it('uses a fixture that validates against the approved chapter contract', () => {
    expect(approvedChaptersResponseSchema.safeParse(approvedChaptersFixture).success).toBe(true);
  });

  it('renders chapter content, safe provenance, and inactive review placeholders', () => {
    render(<ChapterReviewApp />);
    expect(screen.getByRole('heading', { name: 'The House on Marigold Lane' })).toBeInTheDocument();
    expect(screen.getByText('3 approved sources')).toBeInTheDocument();
    expect(screen.getByText('Safe provenance summary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve chapter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled();
  });
});
