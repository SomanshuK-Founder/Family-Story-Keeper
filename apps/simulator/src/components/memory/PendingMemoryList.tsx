import type { GetStoryContextResult } from '@story-keeper/mcp-client';

import { FactCard } from './FactCard.js';
import { IdentityClarificationList } from './IdentityClarificationList.js';
import { RelationshipCard } from './RelationshipCard.js';
import { TimelineMemoryCard } from './TimelineMemoryCard.js';

interface PendingMemoryListProps {
  readonly context: GetStoryContextResult | null;
  readonly highlightedIds: ReadonlySet<string>;
  readonly connected: boolean;
  readonly loading: boolean;
}

export function PendingMemoryList({
  context,
  highlightedIds,
  connected,
  loading,
}: PendingMemoryListProps) {
  const facts = context?.facts.filter((item) => item.status === 'pending') ?? [];
  const relationships = context?.relationships.filter((item) => item.status === 'pending') ?? [];
  const events = context?.timelineEvents.filter((item) => item.status === 'pending') ?? [];
  const identities = context?.personIdentities ?? [];
  const identityByPersonId = new Map(identities.map((identity) => [identity.personId, identity]));
  const unresolvedCount = identities.filter((identity) => identity.status === 'unresolved').length;
  const itemCount = facts.length + relationships.length + events.length;

  return (
    <section className="pending-memory" aria-labelledby="pending-memory-title">
      <div className="pending-memory-heading">
        <div>
          <p className="panel-label">Narrator review</p>
          <h2 id="pending-memory-title">Memories waiting for review</h2>
        </div>
        {itemCount > 0 ? <span>{itemCount} pending</span> : null}
      </div>

      {!connected ? (
        <p className="memory-empty">Connect to load Rosa’s structured memory.</p>
      ) : null}
      {connected && loading && context === null ? (
        <p className="memory-empty">Loading Rosa’s structured memory…</p>
      ) : null}
      {connected && !loading && itemCount === 0 && unresolvedCount === 0 ? (
        <p className="memory-empty">No structured memory is visible yet.</p>
      ) : null}
      <IdentityClarificationList identities={identities} highlightedIds={highlightedIds} />
      {itemCount > 0 ? (
        <div className="memory-card-grid">
          {facts.map((fact) => (
            <FactCard
              key={fact.id}
              fact={fact}
              identity={identityByPersonId.get(fact.subjectPersonId)}
              isNew={highlightedIds.has(fact.id)}
            />
          ))}
          {relationships.map((relationship) => (
            <RelationshipCard
              key={relationship.id}
              relationship={relationship}
              fromIdentity={identityByPersonId.get(relationship.fromPersonId)}
              toIdentity={identityByPersonId.get(relationship.toPersonId)}
              isNew={highlightedIds.has(relationship.id)}
            />
          ))}
          {events.map((event) => (
            <TimelineMemoryCard
              key={event.id}
              event={event}
              identity={identityByPersonId.get(event.subjectPersonId)}
              isNew={highlightedIds.has(event.id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
