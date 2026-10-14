import { AppShell } from '@story-keeper/ui';

export function SimulatorApp() {
  return (
    <AppShell activeSurface="simulator">
      <header className="page-heading">
        <h1>Simulator</h1>
        <p>A quiet workspace for future typed and voice-guided Story Keeper conversations.</p>
      </header>

      <div className="simulator-layout">
        <section
          className="surface-panel conversation-placeholder"
          aria-labelledby="conversation-title"
        >
          <div>
            <p className="panel-label">Conversation</p>
            <h2 id="conversation-title">A story begins here</h2>
            <p className="empty-copy">
              Conversation turns will appear in this region in a later phase.
            </p>
          </div>
          <div className="message-placeholder" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>

        <section className="surface-panel visual-placeholder" aria-labelledby="visual-title">
          <div className="memory-window" aria-hidden="true">
            <span />
          </div>
          <div>
            <p className="panel-label">Story visual</p>
            <h2 id="visual-title">A family moment</h2>
            <p className="empty-copy">
              Approved story visuals can be presented here in a future phase.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
