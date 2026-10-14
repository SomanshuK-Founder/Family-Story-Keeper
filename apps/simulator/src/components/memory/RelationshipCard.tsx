import type { GetStoryContextResult } from '@story-keeper/mcp-client';

import { ProvenanceDisclosure } from './ProvenanceDisclosure.js';

type StoryRelationship = GetStoryContextResult['relationships'][number];

interface RelationshipCardProps {
  readonly relationship: StoryRelationship;
  readonly isNew: boolean;
}

export function RelationshipCard({ relationship, isNew }: RelationshipCardProps) {
  return (
    <article className="memory-card" data-new={isNew || undefined}>
      <p className="memory-state">Pending relationship candidate</p>
      <h3>{humanize(relationship.relationshipType)} relationship</h3>
      <p>This relationship candidate is waiting for Rosa’s review.</p>
      <ProvenanceDisclosure sourceCount={relationship.sourceCount} />
    </article>
  );
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
