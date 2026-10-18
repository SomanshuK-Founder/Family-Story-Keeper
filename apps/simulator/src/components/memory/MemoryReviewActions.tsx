import type { ApprovalAction, StoryItemTargetType } from '@story-keeper/shared';
import { useEffect, useId, useRef, useState } from 'react';

export type MemoryMutationAction = ApprovalAction | 'remove';

export interface ActiveMemoryMutation {
  readonly targetType: StoryItemTargetType;
  readonly targetId: string;
  readonly action: MemoryMutationAction;
}

export interface MemoryMutationNotice {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

export type MutateMemory = (
  targetType: StoryItemTargetType,
  targetId: string,
  action: MemoryMutationAction,
) => void;

interface MemoryReviewActionsProps {
  readonly targetType: StoryItemTargetType;
  readonly targetId: string;
  readonly itemLabel: string;
  readonly status: 'pending' | 'approved';
  readonly approvalBlockedReason?: string | null;
  readonly activeMutation: ActiveMemoryMutation | null;
  readonly onMutate: MutateMemory;
}

type ConfirmedAction = Extract<MemoryMutationAction, 'reject' | 'revoke' | 'remove'>;

export function MemoryReviewActions({
  targetType,
  targetId,
  itemLabel,
  status,
  approvalBlockedReason = null,
  activeMutation,
  onMutate,
}: MemoryReviewActionsProps) {
  const [confirmationAction, setConfirmationAction] = useState<ConfirmedAction | null>(null);
  const confirmationId = useId();
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const originButtonRef = useRef<HTMLButtonElement | null>(null);
  const isThisItemActive =
    activeMutation?.targetType === targetType && activeMutation.targetId === targetId;

  useEffect(() => {
    if (confirmationAction !== null) confirmationRef.current?.focus();
  }, [confirmationAction]);

  useEffect(() => {
    setConfirmationAction(null);
  }, [status]);

  function requestConfirmation(action: ConfirmedAction, originButton: HTMLButtonElement): void {
    originButtonRef.current = originButton;
    setConfirmationAction(action);
  }

  function cancelConfirmation(): void {
    setConfirmationAction(null);
    window.setTimeout(() => originButtonRef.current?.focus(), 0);
  }

  const confirmation =
    confirmationAction === null ? null : confirmationFor(confirmationAction, itemLabel);

  return (
    <div className="memory-review-actions">
      {status === 'pending' ? (
        <>
          <div className="memory-action-buttons" aria-label={`Actions for ${itemLabel}`}>
            <button
              className="primary-button"
              type="button"
              aria-label={`Approve ${itemLabel}`}
              disabled={activeMutation !== null || approvalBlockedReason !== null}
              onClick={() => {
                onMutate(targetType, targetId, 'approve');
              }}
            >
              Approve
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-label={`Reject ${itemLabel}`}
              disabled={activeMutation !== null}
              onClick={(event) => {
                requestConfirmation('reject', event.currentTarget);
              }}
            >
              Reject
            </button>
            <button
              className="text-button"
              type="button"
              aria-label={`Remove pending memory ${itemLabel}`}
              disabled={activeMutation !== null}
              onClick={(event) => {
                requestConfirmation('remove', event.currentTarget);
              }}
            >
              Remove pending memory
            </button>
          </div>
          {approvalBlockedReason === null ? null : (
            <p className="memory-action-guidance">{approvalBlockedReason}</p>
          )}
        </>
      ) : (
        <button
          className="secondary-button"
          type="button"
          aria-label={`Revoke approval for ${itemLabel}`}
          disabled={activeMutation !== null}
          onClick={(event) => {
            requestConfirmation('revoke', event.currentTarget);
          }}
        >
          Revoke approval
        </button>
      )}

      {isThisItemActive ? (
        <p className="memory-mutation-progress" role="status">
          {progressLabel(activeMutation.action)}
        </p>
      ) : null}

      {confirmation === null ? null : (
        <div
          className="memory-action-confirmation"
          ref={confirmationRef}
          role="group"
          tabIndex={-1}
          aria-labelledby={`${confirmationId}-title`}
        >
          <h4 id={`${confirmationId}-title`}>{confirmation.heading}</h4>
          <p>{confirmation.consequence}</p>
          <p>{confirmation.preservation}</p>
          <div className="confirmation-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={activeMutation !== null}
              onClick={cancelConfirmation}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="button"
              aria-label={`Confirm ${confirmation.accessibleAction} for ${itemLabel}`}
              disabled={activeMutation !== null}
              onClick={() => {
                onMutate(targetType, targetId, confirmation.action);
              }}
            >
              {confirmation.buttonLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function confirmationFor(action: ConfirmedAction, itemLabel: string) {
  if (action === 'reject') {
    return {
      action,
      heading: `Reject ${itemLabel}?`,
      consequence:
        'This memory will be marked rejected and will not appear in family-visible story views.',
      preservation: 'The original interview answer and source history will remain preserved.',
      accessibleAction: 'rejection',
      buttonLabel: 'Confirm rejection',
    } as const;
  }
  if (action === 'revoke') {
    return {
      action,
      heading: `Revoke approval for ${itemLabel}?`,
      consequence: 'This memory will stop appearing in approved family views.',
      preservation: 'Its source history will remain preserved.',
      accessibleAction: 'revocation',
      buttonLabel: 'Confirm revocation',
    } as const;
  }
  return {
    action,
    heading: `Remove pending memory ${itemLabel}?`,
    consequence: 'This pending memory will be removed from active story views.',
    preservation: 'The original interview answer and source history will remain preserved.',
    accessibleAction: 'pending memory removal',
    buttonLabel: 'Confirm removal',
  } as const;
}

function progressLabel(action: MemoryMutationAction): string {
  if (action === 'approve') return 'Approving memory…';
  if (action === 'reject') return 'Rejecting memory…';
  if (action === 'revoke') return 'Revoking approval…';
  return 'Removing pending memory…';
}
