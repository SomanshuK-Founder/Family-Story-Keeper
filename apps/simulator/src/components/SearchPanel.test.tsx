// @vitest-environment happy-dom

import type { FamilyStorySearchResult } from '@story-keeper/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SearchPanel, type SearchUiStatus } from './SearchPanel.js';
import '../test-setup.js';

const orderedResults: readonly FamilyStorySearchResult[] = [
  {
    sourceType: 'timeline_event',
    sourceId: '10000000-0000-4000-8000-000000000001',
    title: 'Zulu move',
    snippet: '<script>alert("family")</script> remained plain text.',
    personId: '10000000-0000-4000-8000-000000000009',
    personDisplayName: 'Élodie',
    date: { earliestYear: 1962, latestYear: 1964, precision: 'range' },
    rank: -3,
  },
  {
    sourceType: 'fact',
    sourceId: '10000000-0000-4000-8000-000000000002',
    title: 'Alpha memory',
    snippet: 'A safe approved memory.',
    personId: null,
    personDisplayName: null,
    date: null,
    rank: -2,
  },
  {
    sourceType: 'chapter',
    sourceId: '10000000-0000-4000-8000-000000000003',
    title: 'Middle chapter',
    snippet: 'A chapter excerpt.',
    personId: null,
    personDisplayName: null,
    date: null,
    rank: -1,
  },
  {
    sourceType: 'relationship',
    sourceId: '10000000-0000-4000-8000-000000000004',
    title: 'Rosa — sibling — Raj',
    snippet: 'Rosa sibling Raj',
    personId: null,
    personDisplayName: null,
    date: null,
    rank: 0,
  },
];

function renderPanel(
  overrides: Partial<{
    connected: boolean;
    query: string;
    status: SearchUiStatus;
    results: readonly FamilyStorySearchResult[];
    validationMessage: string | null;
    errorMessage: string | null;
  }> = {},
) {
  const onSubmit = vi.fn();
  const onQueryChange = vi.fn();
  const view = render(
    <SearchPanel
      actor="rosa"
      connected={overrides.connected ?? true}
      query={overrides.query ?? 'garden'}
      status={overrides.status ?? 'idle'}
      results={overrides.results ?? []}
      validationMessage={overrides.validationMessage ?? null}
      errorMessage={overrides.errorMessage ?? null}
      onActorChange={vi.fn()}
      onQueryChange={onQueryChange}
      onSubmit={onSubmit}
    />,
  );
  return { ...view, onQueryChange, onSubmit };
}

describe('SearchPanel', () => {
  it('preserves backend order, labels every source type, and renders HTML-like snippets as text', () => {
    const { container } = renderPanel({ status: 'ready', results: orderedResults });
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'Zulu move',
      'Alpha memory',
      'Middle chapter',
      'Rosa — sibling — Raj',
    ]);
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Timeline'),
      expect.stringContaining('Memory'),
      expect.stringContaining('Chapter'),
      expect.stringContaining('Relationship'),
    ]);
    expect(screen.getByText('<script>alert("family")</script> remained plain text.')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('rank');
    expect(container.textContent).not.toContain('-3');
  });

  it('submits from the accessible search form with Enter', () => {
    const { onSubmit } = renderPanel();
    fireEvent.submit(screen.getByRole('search'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('distinguishes loading, zero results, validation, backend error, and disconnected states', () => {
    const { rerender } = renderPanel({ status: 'loading' });
    expect(screen.getByText('Searching approved family stories…')).toBeVisible();

    rerender(
      <SearchPanel
        actor="rosa"
        connected
        query="nothing"
        status="ready"
        results={[]}
        validationMessage={null}
        errorMessage={null}
        onActorChange={vi.fn()}
        onQueryChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText('0 results found.')).toBeVisible();
    expect(screen.getByText('No matching family stories found.')).toBeVisible();

    rerender(
      <SearchPanel
        actor="rosa"
        connected
        query="*"
        status="idle"
        results={[]}
        validationMessage="Enter a search with at least one letter or number."
        errorMessage={null}
        onActorChange={vi.fn()}
        onQueryChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('at least one letter or number');

    rerender(
      <SearchPanel
        actor="rosa"
        connected
        query="garden"
        status="error"
        results={[]}
        validationMessage={null}
        errorMessage="Family story search could not be completed. Try again."
        onActorChange={vi.fn()}
        onQueryChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('could not be completed');

    rerender(
      <SearchPanel
        actor="rosa"
        connected={false}
        query=""
        status="idle"
        results={[]}
        validationMessage={null}
        errorMessage={null}
        onActorChange={vi.fn()}
        onQueryChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Connect to Story Keeper to search approved family stories.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Search as' })).toBeDisabled();
  });
});
