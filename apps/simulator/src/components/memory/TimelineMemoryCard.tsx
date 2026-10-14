import type { GetStoryContextResult } from '@story-keeper/mcp-client';
import { formatStoryDate } from '@story-keeper/ui';

import { ProvenanceDisclosure } from './ProvenanceDisclosure.js';

type StoryTimelineEvent = GetStoryContextResult['timelineEvents'][number];

interface TimelineMemoryCardProps {
  readonly event: StoryTimelineEvent;
  readonly isNew: boolean;
}

export function TimelineMemoryCard({ event, isNew }: TimelineMemoryCardProps) {
  return (
    <article className="memory-card" data-new={isNew || undefined}>
      <p className="memory-state">Pending timeline memory</p>
      <h3>{event.title}</h3>
      <p className="memory-date">{formatStoryDate(event.date)}</p>
      <p>{event.description}</p>
      <ProvenanceDisclosure sourceCount={event.sourceCount} />
    </article>
  );
}
