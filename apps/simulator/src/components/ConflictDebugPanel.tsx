import type { ListPendingConflictsResult } from '@story-keeper/mcp-client';
import { formatStoryDate } from '@story-keeper/ui';

interface ConflictDebugPanelProps {
  readonly conflicts: ListPendingConflictsResult['conflicts'];
  readonly narratorMode: boolean;
}

export function ConflictDebugPanel({ conflicts, narratorMode }: ConflictDebugPanelProps) {
  return (
    <section aria-labelledby="conflict-debug-title">
      <h3 id="conflict-debug-title">Pending conflicts</h3>
      {!narratorMode ? (
        <p className="developer-empty">Conflict review is available only in narrator mode.</p>
      ) : conflicts.length === 0 ? (
        <p className="developer-empty">No unresolved conflicts.</p>
      ) : (
        <ul className="developer-item-list">
          {conflicts.map((conflict) => (
            <li key={conflict.contradictionId}>
              <strong>{humanize(conflict.contradictionType)}</strong>
              <p>
                {claimLabel(conflict.left)} ↔ {claimLabel(conflict.right)}
              </p>
              <small>Unresolved · {conflict.suggestedQuestion}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function claimLabel(claim: ListPendingConflictsResult['conflicts'][number]['left']): string {
  if (claim.kind === 'fact') return `${humanize(claim.factType)}: ${claim.value}`;
  return `${claim.title} (${formatStoryDate(claim.date)})`;
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
