import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import type { StoryContextPersonIdentity } from '@story-keeper/shared';
import { formatStoryDate } from '@story-keeper/ui';

import { PersonIdentityStatus } from './PersonIdentityStatus.js';
import { ProvenanceDisclosure } from './ProvenanceDisclosure.js';
import {
  MemoryReviewActions,
  type ActiveMemoryMutation,
  type MutateMemory,
} from './MemoryReviewActions.js';

type StoryTimelineEvent = GetStoryContextResult['timelineEvents'][number];

interface TimelineMemoryCardProps {
  readonly event: StoryTimelineEvent;
  readonly identity: StoryContextPersonIdentity | undefined;
  readonly isNew: boolean;
  readonly canManage: boolean;
  readonly activeMutation: ActiveMemoryMutation | null;
  readonly onMutate: MutateMemory;
}

export function TimelineMemoryCard({
  event,
  identity,
  isNew,
  canManage,
  activeMutation,
  onMutate,
}: TimelineMemoryCardProps) {
  return (
    <article className="memory-card" data-new={isNew || undefined}>
      <p className="memory-state" data-status={event.status}>
        {event.status === 'approved' ? 'Approved timeline memory' : 'Pending timeline memory'}
      </p>
      <h3>{event.title}</h3>
      <p className="memory-date">{formatStoryDate(event.date)}</p>
      <p>{event.description}</p>
      <PersonIdentityStatus identity={identity} />
      <ProvenanceDisclosure
        sourceCount={event.sourceCount}
        itemLabel={event.title}
        itemType="timeline memory"
      />
      {canManage ? (
        <MemoryReviewActions
          targetType="timeline_event"
          targetId={event.id}
          itemLabel={event.title}
          status={event.status}
          approvalBlockedReason={
            event.sourceCount === 0
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
