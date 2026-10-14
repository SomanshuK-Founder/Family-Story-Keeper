import type { TimelineResponse } from '@story-keeper/shared';

import { formatStoryDate } from './story-date.js';

interface TimelineViewProps {
  readonly timeline: TimelineResponse;
  readonly emptyMessage?: string;
  readonly labelledBy?: string;
}

export function TimelineView({
  timeline,
  emptyMessage = 'No approved family events are available yet.',
  labelledBy,
}: TimelineViewProps) {
  if (timeline.items.length === 0) return <p className="empty-copy">{emptyMessage}</p>;

  return (
    <ol className="timeline-list" aria-labelledby={labelledBy}>
      {timeline.items.map((item) => (
        <li key={item.id} data-precision={item.date.precision}>
          <div className="timeline-marker" aria-hidden="true" />
          <article>
            <p className="timeline-date">{formatStoryDate(item.date)}</p>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <small>
              {item.personDisplayName} · {item.sourceCount}{' '}
              {item.sourceCount === 1 ? 'source' : 'sources'}
            </small>
          </article>
        </li>
      ))}
    </ol>
  );
}
