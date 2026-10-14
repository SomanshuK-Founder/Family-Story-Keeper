import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import { formatStoryDate } from '@story-keeper/ui';

interface StoryContextPanelProps {
  readonly context: GetStoryContextResult;
}

export function StoryContextPanel({ context }: StoryContextPanelProps) {
  const itemCount =
    context.facts.length + context.relationships.length + context.timelineEvents.length;
  if (itemCount === 0) {
    return (
      <p className="developer-empty">
        No structured story items are visible to {context.actor.displayName}.
      </p>
    );
  }

  return (
    <div className="context-sections">
      <ContextSection title="Facts" empty={context.facts.length === 0}>
        {context.facts.map((fact) => (
          <li key={fact.id}>
            <strong>{humanize(fact.factType)}</strong>: {fact.value}
            <ItemMeta status={fact.status} sourceCount={fact.sourceCount} />
          </li>
        ))}
      </ContextSection>
      <ContextSection title="Relationships" empty={context.relationships.length === 0}>
        {context.relationships.map((relationship) => (
          <li key={relationship.id}>
            <strong>{humanize(relationship.relationshipType)}</strong> relationship
            <ItemMeta status={relationship.status} sourceCount={relationship.sourceCount} />
          </li>
        ))}
      </ContextSection>
      <ContextSection title="Timeline memories" empty={context.timelineEvents.length === 0}>
        {context.timelineEvents.map((event) => (
          <li key={event.id}>
            <strong>{event.title}</strong> · {formatStoryDate(event.date)}
            <p>{event.description}</p>
            <ItemMeta status={event.status} sourceCount={event.sourceCount} />
          </li>
        ))}
      </ContextSection>
    </div>
  );
}

function ContextSection({
  title,
  empty,
  children,
}: {
  readonly title: string;
  readonly empty: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      {empty ? (
        <p className="developer-empty">None</p>
      ) : (
        <ul className="developer-item-list">{children}</ul>
      )}
    </section>
  );
}

function ItemMeta({
  status,
  sourceCount,
}: {
  readonly status: string;
  readonly sourceCount: number;
}) {
  return (
    <small>
      {humanize(status)} · {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
    </small>
  );
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
