import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import type { StoryContextPersonIdentity } from '@story-keeper/shared';
import { formatStoryDate } from '@story-keeper/ui';

import { PersonIdentityStatus } from './PersonIdentityStatus.js';
import { ProvenanceDisclosure } from './ProvenanceDisclosure.js';

type StoryTimelineEvent = GetStoryContextResult['timelineEvents'][number];

interface TimelineMemoryCardProps {
  readonly event: StoryTimelineEvent;
  readonly identity: StoryContextPersonIdentity | undefined;
  readonly isNew: boolean;
}

export function TimelineMemoryCard({ event, identity, isNew }: TimelineMemoryCardProps) {
  return (
    <article className="memory-card" data-new={isNew || undefined}>
      <p className="memory-state">Pending timeline memory</p>
      <h3>{event.title}</h3>
      <p className="memory-date">{formatStoryDate(event.date)}</p>
      <p>{event.description}</p>
      <PersonIdentityStatus identity={identity} />
      <ProvenanceDisclosure
        sourceCount={event.sourceCount}
        itemLabel={event.title}
        itemType="timeline memory"
      />
    </article>
  );
}
