import { useState, type ReactNode } from 'react';

export type SurfaceId = 'simulator' | 'timeline' | 'family-tree' | 'chapter-review';

const surfaces: ReadonlyArray<{ id: SurfaceId; label: string; href: string }> = [
  { id: 'simulator', label: 'Simulator', href: 'http://localhost:4173/' },
  { id: 'timeline', label: 'Timeline', href: 'http://localhost:4174/' },
  { id: 'family-tree', label: 'Family Tree', href: 'http://localhost:4175/' },
  { id: 'chapter-review', label: 'Chapter Review', href: 'http://localhost:4176/' },
];

type AppShellProps = {
  activeSurface: SurfaceId;
  children: ReactNode;
};

export function AppShell({ activeSurface, children }: AppShellProps) {
  const [dayOffset, setDayOffset] = useState(0);

  return (
    <div className="story-app">
      <header className="story-header">
        <a className="story-brand" href="http://localhost:4173/" aria-label="Story Keeper home">
          <span className="story-mark" aria-hidden="true">
            SK
          </span>
          <span>Story Keeper</span>
        </a>
        <div className="story-context" aria-label="Story context controls">
          <label className="story-field">
            <span>Narrator</span>
            <select defaultValue="rosa" aria-label="Narrator">
              <option value="rosa">Rosa</option>
              <option value="lena">Lena</option>
            </select>
          </label>
          <label className="story-field">
            <span>Relative</span>
            <select defaultValue="maya" aria-label="Relative">
              <option value="maya">Maya</option>
              <option value="arun">Arun</option>
            </select>
          </label>
          <button
            className="advance-button"
            type="button"
            onClick={() => {
              setDayOffset((currentOffset) => currentOffset + 3);
            }}
          >
            +3 Days
          </button>
        </div>
        <p className="day-status" aria-live="polite">
          {dayOffset === 0 ? 'Demo day: Today' : `Demo day: +${String(dayOffset)} days`}
        </p>
      </header>

      <nav className="surface-nav" aria-label="Story Keeper surfaces">
        {surfaces.map((surface) => (
          <a
            key={surface.id}
            href={surface.href}
            aria-current={surface.id === activeSurface ? 'page' : undefined}
          >
            {surface.label}
          </a>
        ))}
      </nav>

      <main className="story-main">{children}</main>
    </div>
  );
}
