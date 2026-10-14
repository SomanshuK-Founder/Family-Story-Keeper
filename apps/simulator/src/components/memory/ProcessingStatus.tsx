import type { MemoryProcessingPhase } from '../../features/memory/processing.js';

interface ProcessingStatusProps {
  readonly phase: MemoryProcessingPhase;
  readonly onCheckAgain: () => void;
}

export function ProcessingStatus({ phase, onCheckAgain }: ProcessingStatusProps) {
  if (phase === 'idle') return null;

  return (
    <section className="processing-status" data-phase={phase} role="status" aria-live="polite">
      {phase === 'processing' ? (
        <>
          <strong>Your answer was saved.</strong>
          <span>Story Keeper is organizing the memory.</span>
        </>
      ) : null}
      {phase === 'available' ? (
        <>
          <strong>New structured memory is ready.</strong>
          <span>It is pending Rosa’s review below.</span>
        </>
      ) : null}
      {phase === 'delayed' ? (
        <>
          <strong>Your answer is safely saved.</strong>
          <span>Story Keeper is still organizing it in the background.</span>
          <button className="secondary-button" type="button" onClick={onCheckAgain}>
            Check again
          </button>
        </>
      ) : null}
      {phase === 'unavailable' ? (
        <>
          <strong>Your answer is safely saved.</strong>
          <span>Story Keeper couldn’t check for new memory right now.</span>
          <button className="secondary-button" type="button" onClick={onCheckAgain}>
            Try checking again
          </button>
        </>
      ) : null}
    </section>
  );
}
