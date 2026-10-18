import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import type { StoryContextPersonIdentity } from '@story-keeper/shared';

import { identityDisplayName, PersonIdentityStatus } from './PersonIdentityStatus.js';
import { ProvenanceDisclosure } from './ProvenanceDisclosure.js';
import {
  MemoryReviewActions,
  type ActiveMemoryMutation,
  type MutateMemory,
} from './MemoryReviewActions.js';

type StoryRelationship = GetStoryContextResult['relationships'][number];

interface RelationshipCardProps {
  readonly relationship: StoryRelationship;
  readonly fromIdentity: StoryContextPersonIdentity | undefined;
  readonly toIdentity: StoryContextPersonIdentity | undefined;
  readonly isNew: boolean;
  readonly canManage: boolean;
  readonly activeMutation: ActiveMemoryMutation | null;
  readonly onMutate: MutateMemory;
}

export function RelationshipCard({
  relationship,
  fromIdentity,
  toIdentity,
  isNew,
  canManage,
  activeMutation,
  onMutate,
}: RelationshipCardProps) {
  const relationshipLabel = humanize(relationship.relationshipType);
  const fromName = identityDisplayName(fromIdentity);
  const toName = identityDisplayName(toIdentity);
  const hasUnresolvedIdentity =
    fromIdentity?.status === 'unresolved' || toIdentity?.status === 'unresolved';
  const identitiesAreConfirmed =
    fromIdentity?.status === 'confirmed' && toIdentity?.status === 'confirmed';
  const approvalBlockedReason =
    relationship.sourceCount === 0
      ? 'This relationship cannot be approved yet because its source information is incomplete.'
      : !identitiesAreConfirmed
        ? 'This relationship cannot be approved until both person references are confirmed.'
        : null;

  return (
    <article className="memory-card" data-new={isNew || undefined}>
      <p className="memory-state" data-status={relationship.status}>
        {relationship.status === 'approved' ? 'Approved relationship' : 'Pending relationship'}
      </p>
      <h3>
        {relationship.status === 'approved'
          ? `${relationshipLabel} relationship`
          : `Possible ${relationshipLabel.toLocaleLowerCase('en')} relationship`}
      </h3>
      <p>
        {relationship.status === 'approved'
          ? fromName === null || toName === null
            ? 'This relationship is approved for family story views.'
            : `An approved relationship involving ${fromName} and ${toName}.`
          : fromName === null || toName === null
            ? 'Story Keeper extracted this as a possible relationship.'
            : `Story Keeper extracted a possible relationship involving ${fromName} and ${toName}.`}
      </p>
      {relationship.status === 'pending' ? (
        <>
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
        </>
      ) : null}
      <ProvenanceDisclosure
        sourceCount={relationship.sourceCount}
        itemLabel={`${relationshipLabel} relationship`}
        itemType="relationship"
      />
      {canManage ? (
        <MemoryReviewActions
          targetType="relationship"
          targetId={relationship.id}
          itemLabel={`${relationshipLabel} relationship`}
          status={relationship.status}
          approvalBlockedReason={approvalBlockedReason}
          activeMutation={activeMutation}
          onMutate={onMutate}
        />
      ) : null}
    </article>
  );
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
