import type { FamilyStorySearchResult, SearchSourceType } from '@story-keeper/shared';
import { formatStoryDate } from '@story-keeper/ui';
import type { SyntheticEvent } from 'react';

import type { InspectorActor } from './DeveloperMemoryInspector.js';

export type SearchUiStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SearchPanelProps {
  readonly actor: InspectorActor;
  readonly connected: boolean;
  readonly query: string;
  readonly status: SearchUiStatus;
  readonly results: readonly FamilyStorySearchResult[];
  readonly validationMessage: string | null;
  readonly errorMessage: string | null;
  readonly onActorChange: (actor: InspectorActor) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onSubmit: () => void;
}

const sourceLabels: Record<SearchSourceType, string> = {
  fact: 'Memory',
  relationship: 'Relationship',
  timeline_event: 'Timeline',
  chapter: 'Chapter',
};

export function SearchPanel({
  actor,
  connected,
  query,
  status,
  results,
  validationMessage,
  errorMessage,
  onActorChange,
  onQueryChange,
  onSubmit,
}: SearchPanelProps) {
  const loading = status === 'loading';

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="surface-panel search-panel" aria-labelledby="search-title">
      <div className="search-heading">
        <div>
          <p className="panel-label">Approved family history</p>
          <h2 id="search-title">Find family stories</h2>
          <p className="empty-copy">
            Find approved memories, relationships, timeline events, and chapters.
          </p>
        </div>
        <label className="search-actor">
          <span>Search as</span>
          <select
            value={actor}
            disabled={!connected}
            onChange={(event) => {
              onActorChange(event.currentTarget.value as InspectorActor);
            }}
          >
            <option value="rosa">Rosa</option>
            <option value="maya">Maya</option>
          </select>
        </label>
      </div>

      <form className="search-form" role="search" onSubmit={submit}>
        <label htmlFor="family-story-search">Search family stories</label>
        <div className="search-controls">
          <input
            id="family-story-search"
            name="family-story-search"
            type="search"
            value={query}
            disabled={!connected || loading}
            aria-invalid={validationMessage === null ? undefined : true}
            aria-describedby={validationMessage === null ? 'search-help' : 'search-validation'}
            autoComplete="off"
            onChange={(event) => {
              onQueryChange(event.currentTarget.value);
            }}
            placeholder="Try a person, place, or memory"
          />
          <button className="primary-button" type="submit" disabled={!connected || loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        <div className="search-field-help">
          <p id="search-help">Use up to 200 characters. Search runs only when you submit.</p>
          <span>{query.length.toLocaleString()} / 200</span>
        </div>
      </form>

      <div className="search-status" aria-live="polite" aria-atomic="true">
        {!connected ? (
          <p>Connect to Story Keeper to search approved family stories.</p>
        ) : validationMessage !== null ? (
          <p id="search-validation" className="field-error" role="alert">
            {validationMessage}
          </p>
        ) : errorMessage !== null ? (
          <p className="search-error" role="alert">
            {errorMessage}
          </p>
        ) : loading ? (
          <p>Searching approved family stories…</p>
        ) : status === 'ready' ? (
          <p>
            {results.length.toLocaleString()} {results.length === 1 ? 'result' : 'results'} found.
          </p>
        ) : (
          <p>Enter a search to begin.</p>
        )}
      </div>

      {status !== 'ready' ? null : results.length === 0 ? (
        <p className="search-empty">No matching family stories found.</p>
      ) : (
        <ol className="search-results" aria-label="Family story search results">
          {results.map((result) => (
            <li key={`${result.sourceType}:${result.sourceId}`} className="search-result-card">
              <p className="search-result-type">{sourceLabels[result.sourceType]}</p>
              <h3>{result.title}</h3>
              <p className="search-snippet">{result.snippet}</p>
              {result.personDisplayName === null && result.date === null ? null : (
                <p className="search-result-meta">
                  {result.personDisplayName}
                  {result.personDisplayName !== null && result.date !== null ? ' · ' : null}
                  {result.date === null ? null : formatStoryDate(result.date)}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
