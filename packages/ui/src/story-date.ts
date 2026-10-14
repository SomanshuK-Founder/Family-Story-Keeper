import type { ApproximateDate } from '@story-keeper/shared';

export function formatStoryDate(date: ApproximateDate): string {
  if (date.precision === 'unknown') {
    return 'Date unknown';
  }

  const earliestYear = date.earliestYear;
  const latestYear = date.latestYear;

  if (earliestYear === null || latestYear === null) {
    return 'Date unknown';
  }

  switch (date.precision) {
    case 'exact':
      return String(earliestYear);
    case 'approximate':
      return `Around ${String(earliestYear)}`;
    case 'range':
      return `${String(earliestYear)}\u2013${String(latestYear)}`;
  }
}
