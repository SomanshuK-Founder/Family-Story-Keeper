import type { GetStoryContextResult } from '@story-keeper/mcp-client';

export const defaultMemoryProcessingTiming = {
  pollIntervalMs: 1_500,
  maxAttempts: 4,
} as const;

export interface MemoryProcessingTiming {
  readonly pollIntervalMs: number;
  readonly maxAttempts: number;
}

export type MemoryProcessingPhase = 'idle' | 'processing' | 'available' | 'delayed' | 'unavailable';

export interface MemoryItemIds {
  readonly facts: ReadonlySet<string>;
  readonly relationships: ReadonlySet<string>;
  readonly timelineEvents: ReadonlySet<string>;
}

export function captureMemoryItemIds(context: GetStoryContextResult): MemoryItemIds {
  return {
    facts: new Set(context.facts.map((item) => item.id)),
    relationships: new Set(context.relationships.map((item) => item.id)),
    timelineEvents: new Set(context.timelineEvents.map((item) => item.id)),
  };
}

export function findNewPendingMemoryIds(
  context: GetStoryContextResult,
  baseline: MemoryItemIds,
): ReadonlySet<string> {
  return new Set([
    ...context.facts
      .filter((item) => item.status === 'pending' && !baseline.facts.has(item.id))
      .map((item) => item.id),
    ...context.relationships
      .filter((item) => item.status === 'pending' && !baseline.relationships.has(item.id))
      .map((item) => item.id),
    ...context.timelineEvents
      .filter((item) => item.status === 'pending' && !baseline.timelineEvents.has(item.id))
      .map((item) => item.id),
  ]);
}

export function waitForProcessingInterval(milliseconds: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve(true);
    }, milliseconds);
    const handleAbort = (): void => {
      window.clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}
