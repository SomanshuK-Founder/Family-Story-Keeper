import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import type { StoryContextPersonIdentity } from '@story-keeper/shared';

import { identityDisplayName, PersonIdentityStatus } from './PersonIdentityStatus.js';
import { ProvenanceDisclosure } from './ProvenanceDisclosure.js';

type StoryRelationship = GetStoryContextResult['relationships'][number];

interface RelationshipCardProps {
  readonly relationship: StoryRelationship;
  readonly fromIdentity: StoryContextPersonIdentity | undefined;
  readonly toIdentity: StoryContextPersonIdentity | undefined;
  readonly isNew: boolean;
}

export function RelationshipCard({
  relationship,
  fromIdentity,
  toIdentity,
  isNew,
}: RelationshipCardProps) {
  const relationshipLabel = humanize(relationship.relationshipType);
  const fromName = identityDisplayName(fromIdentity);
  const toName = identityDisplayName(toIdentity);
  const hasUnresolvedIdentity =
    fromIdentity?.status === 'unresolved' || toIdentity?.status === 'unresolved';
  const identitiesAreConfirmed =
    fromIdentity?.status === 'confirmed' && toIdentity?.status === 'confirmed';

  return (
    <article className="memory-card" data-new={isNew || undefined}>
      <p className="memory-state">Pending relationship</p>
      <h3>Possible {relationshipLabel.toLocaleLowerCase('en')} relationship</h3>
      <p>
        {fromName === null || toName === null
          ? 'Story Keeper extracted this as a possible relationship.'
          : `Story Keeper extracted a possible relationship involving ${fromName} and ${toName}.`}
      </p>
      <p className="relationship-safety">
        {hasUnresolvedIdentity
          ? 'At least one person reference needs clarification. The relationship remains tentative.'
          : identitiesAreConfirmed
            ? 'Both people are confirmed references. The relationship itself remains pending review.'
            : 'Identity details are unavailable. The relationship remains pending review.'}
      </p>
      <div className="relationship-identities" aria-label="People in this relationship">
        <PersonIdentityStatus identity={fromIdentity} />
        <PersonIdentityStatus identity={toIdentity} />
      </div>
      <ProvenanceDisclosure
        sourceCount={relationship.sourceCount}
        itemLabel={`${relationshipLabel} relationship`}
        itemType="relationship"
      />
    </article>
  );
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
