import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import type { StoryContextPersonIdentity } from '@story-keeper/shared';

import { PersonIdentityStatus } from './PersonIdentityStatus.js';
import { ProvenanceDisclosure } from './ProvenanceDisclosure.js';

type StoryFact = GetStoryContextResult['facts'][number];

interface FactCardProps {
  readonly fact: StoryFact;
  readonly identity: StoryContextPersonIdentity | undefined;
  readonly isNew: boolean;
}

export function FactCard({ fact, identity, isNew }: FactCardProps) {
  const factLabel = humanize(fact.factType);
  return (
    <article className="memory-card" data-new={isNew || undefined}>
      <p className="memory-state">Pending memory</p>
      <h3>{factLabel}</h3>
      <p>{fact.value}</p>
      <PersonIdentityStatus identity={identity} />
      <ProvenanceDisclosure sourceCount={fact.sourceCount} itemLabel={factLabel} itemType="fact" />
    </article>
  );
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
