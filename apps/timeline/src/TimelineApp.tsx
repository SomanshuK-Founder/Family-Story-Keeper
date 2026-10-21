import {
  resolveMcpEndpoint,
  StoryKeeperClientError,
  StoryKeeperMcpClient,
  type StoryKeeperClient,
} from '@story-keeper/mcp-client';
import { storyKeeperDemoIds, type TimelineResponse } from '@story-keeper/shared';
import { AppShell, TimelineView } from '@story-keeper/ui';
import { useEffect, useRef, useState } from 'react';

interface TimelineAppProps {
  readonly createClient?: () => StoryKeeperClient;
}

export function TimelineApp({ createClient = createDefaultClient }: TimelineAppProps) {
  const clientRef = useRef<StoryKeeperClient | null>(null);
  if (clientRef.current === null) clientRef.current = createClient();
  const client = clientRef.current;
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
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

  async function loadTimeline(): Promise<void> {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setStatus('loading');
    setTimeline(null);
    setError(null);
    try {
      await client.reconnect();
      if (requestRef.current !== requestId) return;
      const result = await client.getTimeline({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.mayaPersonId,
      });
      if (requestRef.current !== requestId) return;
      setTimeline(result);
      setStatus('ready');
    } catch (caught: unknown) {
      if (requestRef.current !== requestId) return;
      setStatus('error');
      setError(
        caught instanceof StoryKeeperClientError
          ? caught.message
          : 'The family timeline could not be loaded. Try again.',
      );
    } finally {
      if (requestRef.current === requestId) loadingRef.current = false;
    }
  }

  return (
    <AppShell activeSurface="timeline">
      <header className="page-heading">
        <h1>Family timeline</h1>
        <p>Approved memories keep the date detail Rosa actually shared, including uncertainty.</p>
      </header>
      <section className="surface-panel timeline-panel" aria-labelledby="timeline-title">
        <div className="timeline-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={status === 'loading'}
            onClick={() => void loadTimeline()}
          >
            {status === 'loading'
              ? 'Loading…'
              : status === 'ready'
                ? 'Refresh timeline'
                : 'Connect and load timeline'}
          </button>
          <p role="status" aria-live="polite">
            {status === 'idle' ? 'Connect to load approved family events.' : null}
            {status === 'loading' ? 'Loading the approved family timeline…' : null}
            {status === 'ready' ? 'Timeline loaded from Story Keeper.' : null}
          </p>
        </div>
        <h2 id="timeline-title">Approved family events</h2>
        {error === null ? null : (
          <p className="timeline-error" role="alert">
            {error}
          </p>
        )}
        {timeline === null || status !== 'ready' ? null : (
          <TimelineView timeline={timeline} labelledBy="timeline-title" />
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
