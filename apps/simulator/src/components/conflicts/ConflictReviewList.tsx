import type { ListPendingConflictsResult } from '@story-keeper/mcp-client';
import type { ContradictionResolutionType } from '@story-keeper/shared';
import { formatStoryDate } from '@story-keeper/ui';
import { useEffect, useId, useRef, useState } from 'react';

import { ProvenanceDisclosure } from '../memory/ProvenanceDisclosure.js';

type PendingConflict = ListPendingConflictsResult['conflicts'][number];
type ConflictClaim = PendingConflict['left'];

export interface ActiveConflictResolution {
  readonly contradictionId: string;
  readonly resolutionType: ContradictionResolutionType;
}

export interface ConflictNotice {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

interface ConflictReviewListProps {
  readonly conflicts: ListPendingConflictsResult['conflicts'] | null;
  readonly connected: boolean;
  readonly interviewReady: boolean;
  readonly loading: boolean;
  readonly activeResolution: ActiveConflictResolution | null;
  readonly notice: ConflictNotice | null;
  readonly onResolve: (
    contradictionId: string,
    resolutionType: ContradictionResolutionType,
  ) => void;
}

export function ConflictReviewList({
  conflicts,
  connected,
  interviewReady,
  loading,
  activeResolution,
  notice,
  onResolve,
}: ConflictReviewListProps) {
  return (
    <section className="conflict-review" aria-labelledby="conflict-review-title">
      <div className="conflict-review-heading">
        <div>
          <p className="panel-label">Gentle clarification</p>
          <h2 id="conflict-review-title">Memories that need review</h2>
        </div>
        {conflicts !== null && conflicts.length > 0 ? (
          <span>{conflicts.length} to review</span>
        ) : null}
      </div>

      {notice === null ? null : (
        <p
          className="conflict-notice"
          data-kind={notice.kind}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.message}
        </p>
      )}
      {!connected ? (
        <p className="conflict-empty">Connect to review Rosa’s conflicting memories.</p>
      ) : null}
      {connected && !interviewReady ? (
        <p className="conflict-empty">Start or resume Rosa’s interview to review conflicts.</p>
      ) : null}
      {connected && interviewReady && loading && conflicts === null ? (
        <p className="conflict-empty" role="status">
          Loading memories that need review…
        </p>
      ) : null}
      {connected && interviewReady && !loading && conflicts?.length === 0 ? (
        <p className="conflict-empty">No memories need conflict review right now.</p>
      ) : null}
      {conflicts !== null && conflicts.length > 0 ? (
        <div className="conflict-card-list" aria-busy={activeResolution !== null}>
          {conflicts.map((conflict, index) => (
            <ConflictCard
              key={conflict.contradictionId}
              conflict={conflict}
              sequence={index + 1}
              activeResolution={activeResolution}
              onResolve={onResolve}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface ConflictCardProps {
  readonly conflict: PendingConflict;
  readonly sequence: number;
  readonly activeResolution: ActiveConflictResolution | null;
  readonly onResolve: (
    contradictionId: string,
    resolutionType: ContradictionResolutionType,
  ) => void;
}

function ConflictCard({ conflict, sequence, activeResolution, onResolve }: ConflictCardProps) {
  const [selectedResolution, setSelectedResolution] = useState<ContradictionResolutionType | null>(
    null,
  );
  const confirmationId = useId();
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const originButtonRef = useRef<HTMLButtonElement | null>(null);
  const isResolving = activeResolution?.contradictionId === conflict.contradictionId;
  const anotherConflictIsResolving =
    activeResolution !== null && activeResolution.contradictionId !== conflict.contradictionId;

  useEffect(() => {
    if (selectedResolution !== null) confirmationRef.current?.focus();
  }, [selectedResolution]);

  function chooseResolution(
    resolutionType: ContradictionResolutionType,
    originButton: HTMLButtonElement,
  ): void {
    originButtonRef.current = originButton;
    setSelectedResolution(resolutionType);
  }

  function cancelConfirmation(): void {
    setSelectedResolution(null);
    window.setTimeout(() => originButtonRef.current?.focus(), 0);
  }

  const options = getResolutionOptions(conflict.contradictionType);
  const confirmation =
    selectedResolution === null ? null : getConfirmation(conflict, selectedResolution);

  return (
    <article className="conflict-card" aria-labelledby={`${confirmationId}-title`}>
      <div className="conflict-card-heading">
        <div>
          <p className="memory-state">Needs your review</p>
          <h3 id={`${confirmationId}-title`}>Possible conflict {sequence}</h3>
        </div>
        <span>Unresolved</span>
      </div>
      <p className="conflict-intro">Two memories may conflict.</p>
      <p className="conflict-question">{conflict.suggestedQuestion}</p>

      <div className="conflict-comparison">
        <ConflictClaimCard claim={conflict.left} label="Memory A" />
        <ConflictClaimCard claim={conflict.right} label="Memory B" />
      </div>

      <div className="conflict-actions" aria-label="Conflict resolution choices">
        <h4>What happened?</h4>
        <div className="conflict-action-buttons">
          {options.map((option) => (
            <button
              className="secondary-button"
              type="button"
              key={option.resolutionType}
              disabled={activeResolution !== null}
              onClick={(event) => {
                chooseResolution(option.resolutionType, event.currentTarget);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {confirmation === null ? null : (
        <div
          className="conflict-confirmation"
          ref={confirmationRef}
          role="group"
          tabIndex={-1}
          aria-labelledby={`${confirmationId}-confirmation-title`}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && activeResolution === null) {
              event.preventDefault();
              cancelConfirmation();
            }
          }}
        >
          <h4 id={`${confirmationId}-confirmation-title`}>{confirmation.heading}</h4>
          <p>{confirmation.consequence}</p>
          <p>
            Original interview answers and provenance will remain preserved. Resolving this conflict
            does not approve either memory.
          </p>
          {isResolving ? (
            <p className="conflict-submitting" role="status">
              Saving “{confirmation.actionLabel}”…
            </p>
          ) : null}
          <div className="confirmation-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isResolving || anotherConflictIsResolving}
              onClick={cancelConfirmation}
            >
              Go back
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={activeResolution !== null}
              onClick={() => {
                onResolve(conflict.contradictionId, confirmation.resolutionType);
              }}
            >
              Confirm: {confirmation.actionLabel}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function ConflictClaimCard({
  claim,
  label,
}: {
  readonly claim: ConflictClaim;
  readonly label: string;
}) {
  const itemLabel = claim.kind === 'fact' ? humanize(claim.factType) : claim.title;
  return (
    <section className="conflict-claim" aria-label={label}>
      <p className="conflict-memory-label">{label}</p>
      <p className="claim-state">{claimStatusLabel(claim.status)}</p>
      <h4>{itemLabel}</h4>
      {claim.kind === 'fact' ? (
        <p>{claim.value}</p>
      ) : (
        <>
          <p className="memory-date">{formatStoryDate(claim.date)}</p>
          <p>{claim.description}</p>
        </>
      )}
      <ProvenanceDisclosure
        sourceCount={claim.sourceAnswerIds.length}
        itemLabel={`${label}: ${itemLabel}`}
        itemType={claim.kind === 'fact' ? 'fact' : 'timeline memory'}
      />
    </section>
  );
}

function claimStatusLabel(status: ConflictClaim['status']): string {
  if (status === 'pending') {
    return 'Pending memory';
  }
  if (status === 'approved') {
    return 'Approved memory';
  }
  return 'Rejected memory';
}

interface ResolutionOption {
  readonly resolutionType: ContradictionResolutionType;
  readonly label: string;
}

function getResolutionOptions(
  contradictionType: PendingConflict['contradictionType'],
): readonly ResolutionOption[] {
  const options: ResolutionOption[] = [
    { resolutionType: 'keep_left', label: 'Keep the first memory' },
    { resolutionType: 'keep_right', label: 'Keep the second memory' },
  ];
  if (contradictionType === 'timeline_date') {
    options.push({ resolutionType: 'different_events', label: 'These were different events' });
  }
  options.push({
    resolutionType: 'dismiss_not_a_conflict',
    label: 'These do not conflict',
  });
  return options;
}

function getConfirmation(
  conflict: PendingConflict,
  resolutionType: ContradictionResolutionType,
): {
  readonly heading: string;
  readonly consequence: string;
  readonly actionLabel: string;
  readonly resolutionType: ContradictionResolutionType;
} {
  if (resolutionType === 'keep_left') {
    return {
      heading: 'Keep the first memory?',
      consequence: losingClaimConsequence(conflict.right, 'second'),
      actionLabel: 'Keep the first memory',
      resolutionType,
    };
  }
  if (resolutionType === 'keep_right') {
    return {
      heading: 'Keep the second memory?',
      consequence: losingClaimConsequence(conflict.left, 'first'),
      actionLabel: 'Keep the second memory',
      resolutionType,
    };
  }
  if (resolutionType === 'different_events') {
    return {
      heading: 'Treat these as different events?',
      consequence: 'Both timeline memories will remain in their current states.',
      actionLabel: 'These were different events',
      resolutionType,
    };
  }
  return {
    heading: 'Mark these as not conflicting?',
    consequence: 'Both memories will remain in their current states.',
    actionLabel: 'These do not conflict',
    resolutionType,
  };
}

function losingClaimConsequence(claim: ConflictClaim, ordinal: 'first' | 'second'): string {
  if (claim.status === 'pending') {
    return `The ${ordinal} pending memory will be marked rejected.`;
  }
  if (claim.status === 'approved') {
    return `The ${ordinal} memory is already approved, so its approval state will remain unchanged.`;
  }
  return `The ${ordinal} memory is already rejected, so its state will remain unchanged.`;
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
