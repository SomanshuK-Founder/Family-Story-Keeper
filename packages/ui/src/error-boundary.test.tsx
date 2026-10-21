// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from './error-boundary.js';

describe('AppErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('contains unexpected render failures behind safe copy', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <BrokenSurface />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Story Keeper needs to reload');
    expect(screen.queryByText(/stack|private path|payload/i)).not.toBeInTheDocument();
  });
});

function BrokenSurface(): never {
  throw new Error('private path and payload details');
}
