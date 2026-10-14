import type { GetStoryContextResult } from '@story-keeper/mcp-client';

import { FactCard } from './FactCard.js';
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
      {connected && !loading && itemCount === 0 ? (
        <p className="memory-empty">No structured memory is visible yet.</p>
      ) : null}
      {itemCount > 0 ? (
        <div className="memory-card-grid">
          {facts.map((fact) => (
            <FactCard key={fact.id} fact={fact} isNew={highlightedIds.has(fact.id)} />
          ))}
          {relationships.map((relationship) => (
            <RelationshipCard
              key={relationship.id}
              relationship={relationship}
              isNew={highlightedIds.has(relationship.id)}
            />
          ))}
          {events.map((event) => (
            <TimelineMemoryCard key={event.id} event={event} isNew={highlightedIds.has(event.id)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
