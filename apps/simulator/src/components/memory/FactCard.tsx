import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import type { StoryContextPersonIdentity } from '@story-keeper/shared';

import { PersonIdentityStatus } from './PersonIdentityStatus.js';
import { ProvenanceDisclosure } from './ProvenanceDisclosure.js';
import {
  MemoryReviewActions,
  type ActiveMemoryMutation,
  type MutateMemory,
} from './MemoryReviewActions.js';

type StoryFact = GetStoryContextResult['facts'][number];

interface FactCardProps {
  readonly fact: StoryFact;
  readonly identity: StoryContextPersonIdentity | undefined;
  readonly isNew: boolean;
  readonly canManage: boolean;
  readonly activeMutation: ActiveMemoryMutation | null;
  readonly onMutate: MutateMemory;
}

export function FactCard({
  fact,
  identity,
  isNew,
  canManage,
  activeMutation,
  onMutate,
}: FactCardProps) {
  const factLabel = humanize(fact.factType);
  return (
    <article className="memory-card" data-new={isNew || undefined}>
      <p className="memory-state" data-status={fact.status}>
        {fact.status === 'approved' ? 'Approved memory' : 'Pending memory'}
      </p>
      <h3>{factLabel}</h3>
      <p>{fact.value}</p>
      <PersonIdentityStatus identity={identity} />
      <ProvenanceDisclosure sourceCount={fact.sourceCount} itemLabel={factLabel} itemType="fact" />
      {canManage ? (
        <MemoryReviewActions
          targetType="fact"
          targetId={fact.id}
          itemLabel={factLabel}
          status={fact.status}
          approvalBlockedReason={
            fact.sourceCount === 0
              ? 'This memory cannot be approved yet because its source information is incomplete.'
              : null
          }
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
