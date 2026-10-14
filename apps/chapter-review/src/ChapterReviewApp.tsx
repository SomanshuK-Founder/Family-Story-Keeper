import { AppShell } from '@story-keeper/ui';
import { approvedChaptersFixture } from './fixture.js';

export function ChapterReviewApp() {
  const chapter = approvedChaptersFixture.chapters[0];
  if (chapter === undefined) throw new Error('Chapter fixture is empty.');

  return (
    <AppShell activeSurface="chapter-review">
      <header className="page-heading">
        <h1>Chapter review</h1>
        <p>Review an approved family chapter and its safe source summary.</p>
      </header>
      <article className="surface-panel chapter-sheet">
        <p className="chapter-narrator">A story from {chapter.narratorDisplayName}</p>
        <h2>{chapter.title}</h2>
        <p className="chapter-body">{chapter.body}</p>
        <footer className="chapter-footer">
          <p>
            <strong>{chapter.sourceCount} approved sources</strong>
            <br />
            <span>Safe provenance summary</span>
          </p>
          <div className="review-controls" aria-label="Future chapter review controls">
            <button type="button" disabled>
              Approve chapter
            </button>
            <button type="button" disabled>
              Request changes
            </button>
          </div>
        </footer>
      </article>
    </AppShell>
  );
}
