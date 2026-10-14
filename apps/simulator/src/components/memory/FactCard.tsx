import type { GetStoryContextResult } from '@story-keeper/mcp-client';

import { ProvenanceDisclosure } from './ProvenanceDisclosure.js';

type StoryFact = GetStoryContextResult['facts'][number];

interface FactCardProps {
  readonly fact: StoryFact;
  readonly isNew: boolean;
}

export function FactCard({ fact, isNew }: FactCardProps) {
  return (
    <article className="memory-card" data-new={isNew || undefined}>
      <p className="memory-state">Pending memory</p>
      <h3>{humanize(fact.factType)}</h3>
      <p>{fact.value}</p>
      <ProvenanceDisclosure sourceCount={fact.sourceCount} />
    </article>
  );
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
