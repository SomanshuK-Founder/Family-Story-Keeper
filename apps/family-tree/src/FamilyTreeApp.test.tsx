// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { familyGraphResponseSchema } from '@story-keeper/shared';
import { describe, expect, it } from 'vitest';
import { FamilyTreeApp } from './FamilyTreeApp.js';
import { familyGraphFixture } from './fixture.js';
import './test-setup.js';

describe('family graph fixture', () => {
  it('validates against the frozen shared graph schema', () => {
    expect(familyGraphResponseSchema.safeParse(familyGraphFixture).success).toBe(true);
  });

  it('renders only fixture nodes and approved relationship labels', () => {
    render(<FamilyTreeApp />);
    expect(screen.getByRole('heading', { name: 'Rosa' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Maya' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Arun' })).toBeInTheDocument();
    expect(screen.getAllByText(/parent/i)).toHaveLength(2);
  });
});
