import { Component, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public override state: AppErrorBoundaryState = { failed: false };

  public static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  public override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="story-main">
        <section className="surface-panel app-error-boundary" role="alert">
          <h1>Story Keeper needs to reload</h1>
          <p>An unexpected display problem occurred. Refresh this page to continue safely.</p>
        </section>
      </main>
    );
  }
}
