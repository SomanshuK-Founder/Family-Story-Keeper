import { AppShell } from '@story-keeper/ui';
import { familyGraphFixture } from './fixture.js';

const nodePositions = [
  { left: '18%', top: '14%' },
  { left: '60%', top: '14%' },
  { left: '39%', top: '62%' },
] as const;

export function FamilyTreeApp() {
  return (
    <AppShell activeSurface="family-tree">
      <header className="page-heading">
        <h1>Family tree</h1>
        <p>
          A simple view of approved people and relationships, with no identity inference in the
          browser.
        </p>
      </header>
      <section className="surface-panel graph-panel" aria-label="Family relationship preview">
        <svg
          className="graph-lines"
          viewBox="0 0 100 70"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="18" y1="20" x2="60" y2="20" />
          <line x1="60" y1="20" x2="39" y2="64" />
        </svg>
        {familyGraphFixture.nodes.map((node, index) => (
          <article className="person-node" key={node.personId} style={nodePositions[index]}>
            <span className="person-avatar" aria-hidden="true">
              {node.displayName.slice(0, 1)}
            </span>
            <h2>{node.displayName}</h2>
            <p>{node.role === null ? 'Family member' : node.role}</p>
          </article>
        ))}
        <aside className="relationship-key" aria-label="Approved relationships">
          {familyGraphFixture.edges.map((edge) => (
            <p key={edge.relationshipId}>
              <strong>{edge.relationshipType}</strong> · {edge.sourceCount}{' '}
              {edge.sourceCount === 1 ? 'source' : 'sources'}
            </p>
          ))}
        </aside>
      </section>
    </AppShell>
  );
}
