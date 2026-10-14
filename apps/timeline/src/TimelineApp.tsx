import { AppShell, formatStoryDate } from '@story-keeper/ui';
import { timelineFixture } from './fixture.js';

export function TimelineApp() {
  return (
    <AppShell activeSurface="timeline">
      <header className="page-heading">
        <h1>Family timeline</h1>
        <p>Approved memories keep the date detail Rosa actually shared, including uncertainty.</p>
      </header>
      <section className="surface-panel timeline-panel" aria-label="Rosa's timeline">
        <ol className="timeline-list">
          {timelineFixture.items.map((item) => (
            <li key={item.id} data-precision={item.date.precision}>
              <div className="timeline-marker" aria-hidden="true" />
              <div>
                <p className="timeline-date">{formatStoryDate(item.date)}</p>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
                <small>
                  {item.sourceCount} {item.sourceCount === 1 ? 'source' : 'sources'}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </AppShell>
  );
}
