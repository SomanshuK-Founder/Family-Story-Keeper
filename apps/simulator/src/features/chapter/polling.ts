export interface ChapterPollingTiming {
  readonly pollIntervalMs: number;
  readonly maxAttempts: number;
}

export const defaultChapterPollingTiming: ChapterPollingTiming = {
  pollIntervalMs: 750,
  maxAttempts: 20,
};
