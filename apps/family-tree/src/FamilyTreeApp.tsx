import {
  resolveMcpEndpoint,
  StoryKeeperClientError,
  StoryKeeperMcpClient,
  type StoryKeeperClient,
} from '@story-keeper/mcp-client';
import { storyKeeperDemoIds, type FamilyGraphResponse } from '@story-keeper/shared';
import { AppShell } from '@story-keeper/ui';
import { useEffect, useRef, useState } from 'react';

interface FamilyTreeAppProps {
  readonly createClient?: () => StoryKeeperClient;
}

export function FamilyTreeApp({ createClient = createDefaultClient }: FamilyTreeAppProps) {
  const clientRef = useRef<StoryKeeperClient | null>(null);
  if (clientRef.current === null) clientRef.current = createClient();
  const client = clientRef.current;
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [graph, setGraph] = useState<FamilyGraphResponse | null>(null);
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

  async function loadGraph(): Promise<void> {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setStatus('loading');
    setGraph(null);
    setError(null);
    try {
      await client.reconnect();
      if (requestRef.current !== requestId) return;
      const result = await client.getFamilyGraph({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.mayaPersonId,
      });
      if (requestRef.current !== requestId) return;
      setGraph(result);
      setStatus('ready');
    } catch (caught: unknown) {
      if (requestRef.current !== requestId) return;
      setStatus('error');
      setError(
        caught instanceof StoryKeeperClientError
          ? caught.message
          : 'The family tree could not be loaded. Try again.',
      );
    } finally {
      if (requestRef.current === requestId) loadingRef.current = false;
    }
  }

  return (
    <AppShell activeSurface="family-tree">
      <header className="page-heading">
        <h1>Family tree</h1>
        <p>Approved people and relationships, with no identity inference in the browser.</p>
      </header>
      <section className="surface-panel graph-panel" aria-labelledby="family-graph-title">
        <div className="graph-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={status === 'loading'}
            onClick={() => void loadGraph()}
          >
            {status === 'loading'
              ? 'Loading…'
              : status === 'ready'
                ? 'Refresh family tree'
                : 'Connect and load family tree'}
          </button>
          <p role="status" aria-live="polite">
            {status === 'idle' ? 'Connect to load approved family relationships.' : null}
            {status === 'loading' ? 'Loading the approved family tree…' : null}
            {status === 'ready' ? 'Family tree loaded from Story Keeper.' : null}
          </p>
        </div>
        <h2 id="family-graph-title">Confirmed family members</h2>
        {error === null ? null : (
          <p className="graph-error" role="alert">
            {error}
          </p>
        )}
        {status !== 'ready' || graph === null ? null : graph.nodes.length === 0 ? (
          <p className="empty-copy">No approved family relationships are available yet.</p>
        ) : (
          <>
            <ul className="person-grid" aria-label="Confirmed family members">
              {graph.nodes.map((node) => (
                <li key={node.personId}>
                  <article className="person-node">
                    <span className="person-avatar" aria-hidden="true">
                      {node.displayName.slice(0, 1)}
                    </span>
                    <h3>{node.displayName}</h3>
                    <p>{node.role === null ? 'Family member' : node.role}</p>
                  </article>
                </li>
              ))}
            </ul>
            <section className="relationship-key" aria-labelledby="relationship-title">
              <h3 id="relationship-title">Approved relationships</h3>
              {graph.edges.length === 0 ? (
                <p>No approved relationships are available.</p>
              ) : (
                <ul>
                  {graph.edges.map((edge) => (
                    <li key={edge.relationshipId}>
                      <strong>{humanize(edge.relationshipType)}</strong> · {edge.sourceCount}{' '}
                      {edge.sourceCount === 1 ? 'source' : 'sources'}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
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

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
