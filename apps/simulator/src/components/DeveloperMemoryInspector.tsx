import type { GetStoryContextResult, ListPendingConflictsResult } from '@story-keeper/mcp-client';

import { ConflictDebugPanel } from './ConflictDebugPanel.js';
import { StoryContextPanel } from './StoryContextPanel.js';

export type InspectorActor = 'rosa' | 'maya';

interface DeveloperMemoryInspectorProps {
  readonly actor: InspectorActor;
  readonly context: GetStoryContextResult | null;
  readonly conflicts: ListPendingConflictsResult['conflicts'] | null;
  readonly interviewState: 'none' | 'active' | 'complete';
  readonly currentQuestion: string | null;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: string | null;
  readonly connected: boolean;
  readonly onActorChange: (actor: InspectorActor) => void;
  readonly onRefresh: () => void;
}

export function DeveloperMemoryInspector({
  actor,
  context,
  conflicts,
  interviewState,
  currentQuestion,
  status,
  error,
  connected,
  onActorChange,
  onRefresh,
}: DeveloperMemoryInspectorProps) {
  const pendingCount = context === null ? null : countPending(context);
  const unresolvedPeopleCount =
    context === null
      ? null
      : (context.personIdentities ?? []).filter((identity) => identity.status === 'unresolved')
          .length;
  return (
    <aside className="developer-inspector" aria-labelledby="developer-inspector-title">
      <div className="developer-heading">
        <div>
          <p className="panel-label">Developer diagnostics</p>
          <h2 id="developer-inspector-title">Developer Memory Inspector</h2>
          <p>Role-scoped structured read models from Story Keeper.</p>
        </div>
        <div className="developer-controls">
          <label htmlFor="inspector-actor">Inspect memory as</label>
          <select
            id="inspector-actor"
            value={actor}
            disabled={!connected}
            onChange={(event) => {
              onActorChange(event.currentTarget.value as InspectorActor);
            }}
          >
            <option value="rosa">Rosa · narrator</option>
            <option value="maya">Maya · relative</option>
          </select>
          <button type="button" disabled={!connected || status === 'loading'} onClick={onRefresh}>
            {status === 'loading' ? 'Refreshing…' : 'Refresh memory'}
          </button>
        </div>
      </div>

      <dl className="developer-summary">
        <div>
          <dt>Narrator</dt>
          <dd>Rosa</dd>
        </div>
        <div>
          <dt>Interview</dt>
          <dd>{interviewState}</dd>
        </div>
        <div>
          <dt>Current question</dt>
          <dd>{currentQuestion ?? 'None'}</dd>
        </div>
        <div>
          <dt>Pending story items</dt>
          <dd>{pendingCount ?? '—'}</dd>
        </div>
        <div>
          <dt>Pending conflicts</dt>
          <dd>{conflicts?.length ?? '—'}</dd>
        </div>
        <div>
          <dt>People to clarify</dt>
          <dd>{unresolvedPeopleCount ?? '—'}</dd>
        </div>
      </dl>

      <div className="developer-read-model" aria-live="polite" aria-busy={status === 'loading'}>
        {!connected ? <p className="developer-empty">Connect to inspect backend memory.</p> : null}
        {connected && status === 'idle' ? (
          <p className="developer-empty">Refresh to inspect memory.</p>
        ) : null}
        {status === 'loading' ? (
          <p className="developer-empty">Loading role-scoped memory…</p>
        ) : null}
        {status === 'error' ? (
          <p className="developer-error" role="alert">
            {error}
          </p>
        ) : null}
        {status === 'ready' && context !== null && conflicts !== null ? (
          <>
            <p className="visibility-label">
              Viewing as <strong>{context.actor.displayName}</strong> ·{' '}
              {context.visibility === 'narrator_review'
                ? 'Narrator review'
                : 'Approved family view'}
            </p>
            <StoryContextPanel context={context} />
            <ConflictDebugPanel conflicts={conflicts} narratorMode={actor === 'rosa'} />
          </>
        ) : null}
      </div>
    </aside>
  );
}

function countPending(context: GetStoryContextResult): number {
  return [...context.facts, ...context.relationships, ...context.timelineEvents].filter(
    (item) => item.status === 'pending',
  ).length;
}
