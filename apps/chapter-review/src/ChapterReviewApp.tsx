import {
  resolveMcpEndpoint,
  StoryKeeperClientError,
  StoryKeeperMcpClient,
  type StoryKeeperClient,
} from '@story-keeper/mcp-client';
import { storyKeeperDemoIds, type ApprovedChaptersResponse } from '@story-keeper/shared';
import { AppShell } from '@story-keeper/ui';
import { useEffect, useRef, useState } from 'react';

interface ChapterReviewAppProps {
  readonly createClient?: () => StoryKeeperClient;
}

export function ChapterReviewApp({ createClient = createDefaultClient }: ChapterReviewAppProps) {
  const clientRef = useRef<StoryKeeperClient | null>(null);
  if (clientRef.current === null) clientRef.current = createClient();
  const client = clientRef.current;
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [response, setResponse] = useState<ApprovedChaptersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const loadingRef = useRef(false);

  useEffect(
    () => () => {
      requestRef.current += 1;
      loadingRef.current = false;
      void client.disconnect();
    },
    [client],
  );

  async function loadChapters(): Promise<void> {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setStatus('loading');
    setResponse(null);
    setError(null);
    try {
      await client.reconnect();
      if (requestRef.current !== requestId) return;
      const result = await client.getApprovedChapters({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.mayaPersonId,
      });
      if (requestRef.current !== requestId) return;
      setResponse(result);
      setStatus('ready');
    } catch (caught: unknown) {
      if (requestRef.current !== requestId) return;
      setStatus('error');
      setError(
        caught instanceof StoryKeeperClientError
          ? caught.message
          : 'Approved chapters could not be loaded. Try again.',
      );
    } finally {
      if (requestRef.current === requestId) loadingRef.current = false;
    }
  }

  return (
    <AppShell activeSurface="chapter-review">
      <header className="page-heading">
        <h1>Approved chapters</h1>
        <p>Read family chapters only after the narrator has approved them.</p>
      </header>
      <section className="chapter-presentation" aria-labelledby="approved-chapters-title">
        <div className="chapter-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={status === 'loading'}
            onClick={() => void loadChapters()}
          >
            {status === 'loading'
              ? 'Loading…'
              : status === 'ready'
                ? 'Refresh chapters'
                : 'Connect and load chapters'}
          </button>
          <p role="status" aria-live="polite">
            {status === 'idle' ? 'Connect to load approved family chapters.' : null}
            {status === 'loading' ? 'Loading approved family chapters…' : null}
            {status === 'ready' ? 'Approved chapters loaded from Story Keeper.' : null}
          </p>
        </div>
        <h2 id="approved-chapters-title">Family stories</h2>
        {error === null ? null : (
          <p className="chapter-error" role="alert">
            {error}
          </p>
        )}
        {status !== 'ready' || response === null ? null : response.chapters.length === 0 ? (
          <p className="surface-panel chapter-empty">
            No approved family chapters are available yet.
          </p>
        ) : (
          <ol className="chapter-list" aria-labelledby="approved-chapters-title">
            {response.chapters.map((chapter) => (
              <li key={chapter.chapterId}>
                <article className="surface-panel chapter-sheet">
                  <p className="chapter-narrator">A story from {chapter.narratorDisplayName}</p>
                  <h3>{chapter.title}</h3>
                  <p className="chapter-body">{chapter.body}</p>
                  <footer className="chapter-footer">
                    <strong>
                      {chapter.sourceCount} approved{' '}
                      {chapter.sourceCount === 1 ? 'source' : 'sources'}
                    </strong>
                  </footer>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
    </AppShell>
  );
}

function createDefaultClient(): StoryKeeperClient {
  return new StoryKeeperMcpClient(
    resolveMcpEndpoint(import.meta.env.VITE_MCP_URL, window.location.href),
  );
}
