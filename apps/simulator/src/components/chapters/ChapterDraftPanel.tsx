import { maximumChapterTopicLength, type ReviewChapterResult } from '@story-keeper/mcp-client';
import { useEffect, useId, useRef, type SyntheticEvent } from 'react';

export type ChapterUiStatus =
  | 'idle'
  | 'requesting'
  | 'generating'
  | 'loading_review'
  | 'pending_review'
  | 'failed'
  | 'delayed'
  | 'approving'
  | 'rejecting';

export interface ChapterNotice {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

interface ChapterDraftPanelProps {
  readonly narratorName: string;
  readonly connected: boolean;
  readonly topic: string;
  readonly status: ChapterUiStatus;
  readonly review: ReviewChapterResult | null;
  readonly validationMessage: string | null;
  readonly notice: ChapterNotice | null;
  readonly confirmReject: boolean;
  readonly onTopicChange: (topic: string) => void;
  readonly onRequest: () => void;
  readonly onCheckStatus: () => void;
  readonly onApprove: () => void;
  readonly onOpenReject: (origin: HTMLButtonElement) => void;
  readonly onCancelReject: () => void;
  readonly onConfirmReject: () => void;
}

export function ChapterDraftPanel({
  narratorName,
  connected,
  topic,
  status,
  review,
  validationMessage,
  notice,
  confirmReject,
  onTopicChange,
  onRequest,
  onCheckStatus,
  onApprove,
  onOpenReject,
  onCancelReject,
  onConfirmReject,
}: ChapterDraftPanelProps) {
  const topicRef = useRef<HTMLTextAreaElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const rejectButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmationTitleId = useId();

  useEffect(() => {
    if (validationMessage !== null) topicRef.current?.focus();
  }, [validationMessage]);

  useEffect(() => {
    if (confirmReject) confirmationRef.current?.focus();
  }, [confirmReject]);

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onRequest();
  }

  function openReject(origin: HTMLButtonElement): void {
    rejectButtonRef.current = origin;
    onOpenReject(origin);
  }

  function cancelReject(): void {
    onCancelReject();
    window.setTimeout(() => rejectButtonRef.current?.focus(), 0);
  }

  const requestAvailable = status === 'idle' || status === 'failed';
  const mutationActive = status === 'approving' || status === 'rejecting';

  return (
    <section className="chapter-draft-panel" aria-labelledby="chapter-draft-title">
      <div className="chapter-draft-heading">
        <div>
          <p className="panel-label">Narrator chapter studio</p>
          <h2 id="chapter-draft-title">Create a chapter</h2>
          <p className="empty-copy">
            Story Keeper drafts from {narratorName}’s approved memories. Every chapter waits for
            review before family members can read it.
          </p>
        </div>
        <span className="chapter-status" data-status={status} role="status" aria-live="polite">
          {statusLabel(status)}
        </span>
      </div>

      {status === 'failed' ? (
        <div className="chapter-state-card" role="alert">
          <h3>This chapter couldn’t be generated</h3>
          <p>No draft was made available for review. Private provider details remain hidden.</p>
        </div>
      ) : null}

      {requestAvailable ? (
        <form className="chapter-request-form" onSubmit={submit}>
          <label htmlFor="chapter-topic">What should this chapter focus on?</label>
          <textarea
            ref={topicRef}
            id="chapter-topic"
            name="chapter-topic"
            rows={3}
            value={topic}
            disabled={!connected}
            aria-describedby={
              validationMessage === null
                ? 'chapter-topic-help chapter-topic-count'
                : 'chapter-topic-help chapter-topic-count chapter-topic-error'
            }
            aria-invalid={validationMessage === null ? undefined : true}
            onChange={(event) => {
              onTopicChange(event.currentTarget.value);
            }}
            placeholder="For example, Rosa’s early years near the old market"
          />
          <p id="chapter-topic-help" className="field-help">
            The backend chooses eligible approved sources. Your topic is not stored in this browser.
          </p>
          {validationMessage === null ? null : (
            <p id="chapter-topic-error" className="field-error" role="alert">
              {validationMessage}
            </p>
          )}
          <div className="chapter-request-actions">
            <span id="chapter-topic-count" aria-live="polite">
              {topic.length.toLocaleString()} / {maximumChapterTopicLength.toLocaleString()}{' '}
              characters
            </span>
            <button
              className="primary-button"
              type="submit"
              disabled={!connected || topic.trim().length === 0}
            >
              Generate chapter
            </button>
          </div>
        </form>
      ) : null}

      {status === 'requesting' ? (
        <div className="chapter-state-card" role="status" aria-live="polite">
          <h3>Sending chapter request…</h3>
          <p>Story Keeper is checking the approved story material.</p>
        </div>
      ) : null}

      {status === 'generating' || status === 'loading_review' ? (
        <div className="chapter-state-card" role="status" aria-live="polite">
          <h3>{status === 'generating' ? 'Drafting chapter…' : 'Preparing your review…'}</h3>
          <p>
            {status === 'generating'
              ? 'The request was accepted. You can leave this page and return later.'
              : 'The draft is ready and Story Keeper is loading its review copy.'}
          </p>
        </div>
      ) : null}

      {status === 'delayed' ? (
        <div className="chapter-state-card" role="status">
          <h3>The chapter is still being drafted</h3>
          <p>It is safe to leave and check again later.</p>
          <button className="secondary-button" type="button" onClick={onCheckStatus}>
            Check chapter status
          </button>
        </div>
      ) : null}

      {(status === 'pending_review' || mutationActive) && review !== null ? (
        <article className="chapter-review-card" aria-labelledby="chapter-review-title">
          <p className="chapter-review-state">Ready for review</p>
          <h3 id="chapter-review-title">{review.title}</h3>
          <div className="chapter-review-body">{review.body}</div>
          <details className="chapter-source-disclosure">
            <summary>
              Supported by {review.sources.length.toLocaleString()}{' '}
              {review.sources.length === 1 ? 'approved source' : 'approved sources'}
            </summary>
            <ul>
              {review.sources.map((source, index) => (
                <li key={`${source.type}-${String(index)}`}>
                  <strong>{sourceTypeLabel(source.type)}</strong>: {source.label}
                </li>
              ))}
            </ul>
          </details>

          <div
            className="chapter-review-actions"
            aria-label={`Actions for ${review.title ?? 'chapter'}`}
          >
            <button
              className="primary-button"
              type="button"
              disabled={mutationActive}
              onClick={onApprove}
            >
              {status === 'approving' ? 'Approving chapter…' : 'Approve chapter'}
            </button>
            <button
              ref={rejectButtonRef}
              className="secondary-button"
              type="button"
              disabled={mutationActive}
              onClick={(event) => {
                openReject(event.currentTarget);
              }}
            >
              {status === 'rejecting' ? 'Rejecting chapter…' : 'Reject chapter'}
            </button>
          </div>

          {confirmReject ? (
            <div
              ref={confirmationRef}
              className="chapter-reject-confirmation"
              role="group"
              tabIndex={-1}
              aria-labelledby={confirmationTitleId}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !mutationActive) {
                  event.preventDefault();
                  cancelReject();
                }
              }}
            >
              <h4 id={confirmationTitleId}>Reject this chapter?</h4>
              <p>It will not appear in family-visible story views.</p>
              <p>The approved source memories and their history will remain preserved.</p>
              <div className="confirmation-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={mutationActive}
                  onClick={cancelReject}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={mutationActive}
                  onClick={onConfirmReject}
                >
                  Confirm chapter rejection
                </button>
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      {notice === null ? null : (
        <p
          className="chapter-notice"
          data-kind={notice.kind}
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {notice.message}
        </p>
      )}
    </section>
  );
}

function statusLabel(status: ChapterUiStatus): string {
  if (status === 'idle') return 'No active draft';
  if (status === 'requesting') return 'Requesting';
  if (status === 'generating' || status === 'delayed') return 'Generating';
  if (status === 'loading_review' || status === 'pending_review') return 'Ready for review';
  if (status === 'failed') return 'Generation failed';
  if (status === 'approving') return 'Approving';
  return 'Rejecting';
}

function sourceTypeLabel(type: ReviewChapterResult['sources'][number]['type']): string {
  if (type === 'timeline_event') return 'Timeline memory';
  if (type === 'relationship') return 'Relationship';
  return 'Fact';
}
