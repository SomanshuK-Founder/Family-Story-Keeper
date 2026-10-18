import type { GetStoryContextResult } from '@story-keeper/mcp-client';

import { FactCard } from './FactCard.js';
import { IdentityClarificationList } from './IdentityClarificationList.js';
import { RelationshipCard } from './RelationshipCard.js';
import { TimelineMemoryCard } from './TimelineMemoryCard.js';
import type {
  ActiveMemoryMutation,
  MemoryMutationNotice,
  MutateMemory,
} from './MemoryReviewActions.js';

interface PendingMemoryListProps {
  readonly context: GetStoryContextResult | null;
  readonly highlightedIds: ReadonlySet<string>;
  readonly connected: boolean;
  readonly loading: boolean;
  readonly canManage: boolean;
  readonly activeMutation: ActiveMemoryMutation | null;
  readonly notice: MemoryMutationNotice | null;
  readonly onMutate: MutateMemory;
}

export function PendingMemoryList({
  context,
  highlightedIds,
  connected,
  loading,
  canManage,
  activeMutation,
  notice,
  onMutate,
}: PendingMemoryListProps) {
  const facts = context?.facts ?? [];
  const relationships = context?.relationships ?? [];
  const events = context?.timelineEvents ?? [];
  const identities = context?.personIdentities ?? [];
  const identityByPersonId = new Map(identities.map((identity) => [identity.personId, identity]));
  const unresolvedCount = identities.filter((identity) => identity.status === 'unresolved').length;
  const itemCount = facts.length + relationships.length + events.length;
  const pendingCount = [...facts, ...relationships, ...events].filter(
    (item) => item.status === 'pending',
  ).length;
  const title = canManage ? 'Review story memories' : 'Approved family memories';

  return (
    <section className="pending-memory" aria-labelledby="pending-memory-title">
      <div className="pending-memory-heading">
        <div>
          <p className="panel-label">{canManage ? 'Narrator review' : 'Family story'}</p>
          <h2 id="pending-memory-title">{title}</h2>
        </div>
        {canManage && pendingCount > 0 ? <span>{pendingCount} waiting</span> : null}
        {!canManage && itemCount > 0 ? <span>{itemCount} approved</span> : null}
      </div>

      {notice === null ? null : (
        <p
          className="memory-mutation-notice"
          data-kind={notice.kind}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.message}
        </p>
      )}

      {!connected ? <p className="memory-empty">Connect to load family story memory.</p> : null}
      {connected && loading && context === null ? (
        <p className="memory-empty">Loading family story memory…</p>
      ) : null}
      {connected && !loading && itemCount === 0 && unresolvedCount === 0 ? (
        <p className="memory-empty">
          {canManage
            ? 'No memories are waiting for approval right now.'
            : 'No approved family memories are available yet.'}
        </p>
      ) : null}
      {canManage ? (
        <IdentityClarificationList identities={identities} highlightedIds={highlightedIds} />
      ) : null}
      {itemCount > 0 ? (
        <div className="memory-card-grid">
          {facts.map((fact) => (
            <FactCard
              key={fact.id}
              fact={fact}
              identity={identityByPersonId.get(fact.subjectPersonId)}
              isNew={highlightedIds.has(fact.id)}
              canManage={canManage}
              activeMutation={activeMutation}
              onMutate={onMutate}
            />
          ))}
          {relationships.map((relationship) => (
            <RelationshipCard
              key={relationship.id}
              relationship={relationship}
              fromIdentity={identityByPersonId.get(relationship.fromPersonId)}
              toIdentity={identityByPersonId.get(relationship.toPersonId)}
              isNew={highlightedIds.has(relationship.id)}
              canManage={canManage}
              activeMutation={activeMutation}
              onMutate={onMutate}
            />
          ))}
          {events.map((event) => (
            <TimelineMemoryCard
              key={event.id}
              event={event}
              identity={identityByPersonId.get(event.subjectPersonId)}
              isNew={highlightedIds.has(event.id)}
              canManage={canManage}
              activeMutation={activeMutation}
              onMutate={onMutate}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
