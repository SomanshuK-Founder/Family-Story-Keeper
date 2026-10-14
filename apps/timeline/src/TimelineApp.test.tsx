// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { timelineResponseSchema } from '@story-keeper/shared';
import { describe, expect, it } from 'vitest';
import { TimelineApp } from './TimelineApp.js';
import { timelineFixture } from './fixture.js';
import './test-setup.js';

describe('timeline fixture', () => {
  it('validates against the frozen shared response schema', () => {
    expect(timelineResponseSchema.safeParse(timelineFixture).success).toBe(true);
  });

  it('renders exact, approximate, range, and unknown dates without inventing precision', () => {
    render(<TimelineApp />);
    expect(screen.getByText('1942')).toBeInTheDocument();
    expect(screen.getByText('Around 1955')).toBeInTheDocument();
    expect(screen.getByText('1958\u20131962')).toBeInTheDocument();
    expect(screen.getByText('Date unknown')).toBeInTheDocument();
  });
});
