import { useEffect, useRef, type SyntheticEvent } from 'react';

import { maximumFamilyQuestionLength } from '@story-keeper/mcp-client';

export interface FamilyQuestionNotice {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

interface FamilyQuestionComposerProps {
  readonly narratorName: string | null;
  readonly questionText: string;
  readonly connected: boolean;
  readonly submitting: boolean;
  readonly validationMessage: string | null;
  readonly notice: FamilyQuestionNotice | null;
  readonly contextStatus: string;
  readonly onQuestionChange: (questionText: string) => void;
  readonly onSubmit: () => void;
}

export function FamilyQuestionComposer({
  narratorName,
  questionText,
  connected,
  submitting,
  validationMessage,
  notice,
  contextStatus,
  onQuestionChange,
  onSubmit,
}: FamilyQuestionComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousSubmittingRef = useRef(submitting);

  useEffect(() => {
    if (previousSubmittingRef.current && !submitting) textareaRef.current?.focus();
    previousSubmittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    if (validationMessage !== null) textareaRef.current?.focus();
  }, [validationMessage]);

  if (narratorName === null) {
    return (
      <section
        className="surface-panel family-question-panel"
        aria-labelledby="family-question-title"
      >
        <p className="panel-label">Family question</p>
        <h2 id="family-question-title">Ask the narrator</h2>
        <p className="empty-copy">
          There isn’t an active narrator available for questions right now.
        </p>
      </section>
    );
  }

  const descriptionId = 'family-question-description';
  const validationId = validationMessage === null ? undefined : 'family-question-validation';
  const describedBy =
    validationId === undefined ? descriptionId : `${descriptionId} ${validationId}`;

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section
      className="surface-panel family-question-panel"
      aria-labelledby="family-question-title"
    >
      <div>
        <p className="panel-label">Family question</p>
        <h2 id="family-question-title">Ask {narratorName} a question</h2>
        <p id={descriptionId} className="empty-copy">
          Your question will be added to {narratorName}’s future interview prompts.
        </p>
      </div>

      <form className="family-question-form" onSubmit={submit}>
        <label htmlFor="family-question-text">
          What would you like {narratorName} to talk about?
        </label>
        <textarea
          ref={textareaRef}
          id="family-question-text"
          name="family-question-text"
          rows={6}
          value={questionText}
          disabled={!connected || submitting}
          aria-describedby={describedBy}
          aria-invalid={validationMessage === null ? undefined : true}
          onChange={(event) => {
            onQuestionChange(event.currentTarget.value);
          }}
          placeholder={`Ask ${narratorName} about a family memory…`}
        />
        {validationMessage === null ? null : (
          <p id={validationId} className="field-error" role="alert">
            {validationMessage}
          </p>
        )}
        <div className="family-question-actions">
          <span aria-live="polite">
            {questionText.length.toLocaleString()} / {maximumFamilyQuestionLength.toLocaleString()}{' '}
            characters
          </span>
          <button
            className="primary-button"
            type="submit"
            disabled={!connected || submitting || questionText.trim().length === 0}
          >
            {submitting ? 'Sending…' : 'Send question'}
          </button>
        </div>
      </form>

      {notice === null ? null : (
        <p
          className="family-question-notice"
          data-kind={notice.kind}
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {notice.message}
        </p>
      )}
      <p className="save-status" role="status" aria-live="polite">
        {contextStatus}
      </p>
    </section>
  );
}
