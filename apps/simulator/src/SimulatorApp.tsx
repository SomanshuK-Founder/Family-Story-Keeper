import { maximumRawAnswerLength, storyKeeperDemoIds } from '@story-keeper/shared';
import { AppShell } from '@story-keeper/ui';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import {
  resolveMcpEndpoint,
  StoryKeeperClientError,
  StoryKeeperMcpClient,
  type GetNextQuestionResult,
  type GetStoryContextResult,
  type ListPendingConflictsResult,
  type StoryKeeperClient,
} from '@story-keeper/mcp-client';
import {
  DeveloperMemoryInspector,
  type InspectorActor,
} from './components/DeveloperMemoryInspector.js';
import { PendingMemoryList } from './components/memory/PendingMemoryList.js';
import { ProcessingStatus } from './components/memory/ProcessingStatus.js';
import {
  captureMemoryItemIds,
  defaultMemoryProcessingTiming,
  findNewPendingMemoryIds,
  waitForProcessingInterval,
  type MemoryItemIds,
  type MemoryProcessingPhase,
  type MemoryProcessingTiming,
} from './features/memory/processing.js';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
type RequestStatus = 'idle' | 'starting' | 'saving';

interface SimulatorAppProps {
  readonly createClient?: () => StoryKeeperClient;
  readonly processingTiming?: MemoryProcessingTiming;
}

export function SimulatorApp({
  createClient = createDefaultClient,
  processingTiming = defaultMemoryProcessingTiming,
}: SimulatorAppProps) {
  const clientRef = useRef<StoryKeeperClient | null>(null);
  if (clientRef.current === null) clientRef.current = createClient();
  const client = clientRef.current;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [toolCount, setToolCount] = useState<number | null>(null);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [question, setQuestion] = useState<GetNextQuestionResult | null>(null);
  const [answer, setAnswer] = useState('');
  const [notice, setNotice] = useState('Connect to begin Rosa’s interview.');
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [inspectorActor, setInspectorActor] = useState<InspectorActor>('rosa');
  const [storyContext, setStoryContext] = useState<GetStoryContextResult | null>(null);
  const [conflicts, setConflicts] = useState<ListPendingConflictsResult['conflicts'] | null>(null);
  const [inspectorStatus, setInspectorStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const inspectorRequestRef = useRef(0);
  const processingRunRef = useRef(0);
  const processingAbortRef = useRef<AbortController | null>(null);
  const processingBaselineRef = useRef<MemoryItemIds | null>(null);
  const [processingPhase, setProcessingPhase] = useState<MemoryProcessingPhase>('idle');
  const [newMemoryIds, setNewMemoryIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(
    () => () => {
      inspectorRequestRef.current += 1;
      processingRunRef.current += 1;
      processingAbortRef.current?.abort();
      void client.disconnect();
    },
    [client],
  );

  async function connect(): Promise<void> {
    const isReconnect = connectionStatus === 'connected' || connectionStatus === 'error';
    cancelProcessing();
    inspectorRequestRef.current += 1;
    setStoryContext(null);
    setConflicts(null);
    setInspectorStatus('idle');
    setInspectorError(null);
    setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');
    setError(null);
    setNotice(isReconnect ? 'Reconnecting to Story Keeper…' : 'Connecting to Story Keeper…');
    try {
      const tools = isReconnect ? await client.reconnect() : await client.connect();
      setToolCount(tools.length);
      setConnectionStatus('connected');
      setNotice('Connected. Story Keeper’s interview tools are ready.');

      if (interviewId !== null) {
        const resumedInterviewId = await resumeInterview(client);
        await loadInspector(inspectorActor, resumedInterviewId);
        setNotice('Reconnected. Rosa’s interview was restored from Story Keeper.');
      } else {
        await loadInspector(inspectorActor, null);
      }
    } catch (caught: unknown) {
      showError(caught, 'Story Keeper is unavailable. Check the server and try again.');
      setConnectionStatus('error');
      setToolCount(null);
    }
  }

  async function startInterview(): Promise<void> {
    setRequestStatus('starting');
    setError(null);
    setNotice('Resuming Rosa’s story…');
    try {
      const resumedInterviewId = await resumeInterview(client);
      await loadInspector(inspectorActor, resumedInterviewId);
      setNotice('Rosa’s interview is ready.');
    } catch (caught: unknown) {
      showError(caught, 'Rosa’s interview could not be started. Try again.');
    } finally {
      setRequestStatus('idle');
    }
  }

  async function resumeInterview(activeClient: StoryKeeperClient): Promise<string> {
    const started = await activeClient.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.rosaPersonId,
    });
    const nextQuestion = await activeClient.getNextQuestion({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: started.interviewId,
    });
    setInterviewId(started.interviewId);
    setQuestion(nextQuestion);
    return started.interviewId;
  }

  async function submitAnswer(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (question?.status !== 'question' || requestStatus === 'saving') return;
    if (answer.trim().length === 0) {
      setError({ code: 'validation', message: 'Please enter an answer before submitting.' });
      return;
    }

    setRequestStatus('saving');
    setError(null);
    setNotice('Saving your answer…');
    const baseline =
      inspectorActor === 'rosa' && storyContext?.actor.id === storyKeeperDemoIds.rosaPersonId
        ? captureMemoryItemIds(storyContext)
        : null;
    const processingContextId = processingRunRef.current;
    try {
      await client.saveAnswer({
        familyId: storyKeeperDemoIds.familyId,
        interviewId: question.interviewId,
        questionId: question.questionId,
        rawText: answer,
      });
    } catch (caught: unknown) {
      showError(caught, 'Your answer could not be saved. It remains in the answer box.');
      setRequestStatus('idle');
      return;
    }

    setAnswer('');
    setNotice('Answer saved. Story Keeper is organizing the memory.');
    inspectorRequestRef.current += 1;
    if (processingRunRef.current === processingContextId && inspectorActor === 'rosa') {
      void beginProcessingRefresh(baseline);
    }

    try {
      const nextQuestion = await client.getNextQuestion({
        familyId: storyKeeperDemoIds.familyId,
        interviewId: question.interviewId,
      });
      setQuestion(nextQuestion);
    } catch (caught: unknown) {
      setError({
        code: caught instanceof StoryKeeperClientError ? caught.code : 'next_question_unavailable',
        message: 'Your answer was saved, but the next question could not be loaded.',
      });
    } finally {
      setRequestStatus('idle');
    }
  }

  async function beginProcessingRefresh(baseline: MemoryItemIds | null): Promise<void> {
    processingAbortRef.current?.abort();
    const controller = new AbortController();
    processingAbortRef.current = controller;
    const runId = processingRunRef.current + 1;
    processingRunRef.current = runId;
    processingBaselineRef.current = baseline;
    setNewMemoryIds(new Set());
    setProcessingPhase('processing');

    for (let attempt = 0; attempt < processingTiming.maxAttempts; attempt += 1) {
      const shouldContinue = await waitForProcessingInterval(
        processingTiming.pollIntervalMs,
        controller.signal,
      );
      if (!shouldContinue || processingRunRef.current !== runId) return;

      try {
        const nextContext = await client.getStoryContext({
          familyId: storyKeeperDemoIds.familyId,
          actorPersonId: storyKeeperDemoIds.rosaPersonId,
        });
        if (controller.signal.aborted || processingRunRef.current !== runId) return;

        setStoryContext(nextContext);
        setInspectorStatus('ready');
        setInspectorError(null);
        if (processingBaselineRef.current === null) {
          processingBaselineRef.current = captureMemoryItemIds(nextContext);
          continue;
        }

        const addedIds = findNewPendingMemoryIds(nextContext, processingBaselineRef.current);
        if (addedIds.size > 0) {
          setNewMemoryIds(addedIds);
          setProcessingPhase('available');
          return;
        }
      } catch {
        if (controller.signal.aborted || processingRunRef.current !== runId) return;
        setProcessingPhase('unavailable');
        return;
      }
    }

    if (!controller.signal.aborted && processingRunRef.current === runId) {
      setProcessingPhase('delayed');
    }
  }

  function cancelProcessing(): void {
    processingRunRef.current += 1;
    processingAbortRef.current?.abort();
    processingAbortRef.current = null;
    processingBaselineRef.current = null;
    setProcessingPhase('idle');
    setNewMemoryIds(new Set());
  }

  async function loadInspector(
    actor: InspectorActor,
    activeInterviewId: string | null,
  ): Promise<void> {
    const requestId = inspectorRequestRef.current + 1;
    inspectorRequestRef.current = requestId;
    setStoryContext(null);
    setConflicts(null);
    setInspectorError(null);
    setInspectorStatus('loading');

    try {
      const actorPersonId =
        actor === 'rosa' ? storyKeeperDemoIds.rosaPersonId : storyKeeperDemoIds.mayaPersonId;
      const contextPromise = client.getStoryContext({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId,
      });
      const conflictPromise =
        actor === 'rosa' && activeInterviewId !== null
          ? client.listPendingConflicts({
              familyId: storyKeeperDemoIds.familyId,
              interviewId: activeInterviewId,
            })
          : Promise.resolve({ conflicts: [] });
      const [nextContext, nextConflicts] = await Promise.all([contextPromise, conflictPromise]);
      if (inspectorRequestRef.current !== requestId) return;
      setStoryContext(nextContext);
      setConflicts(nextConflicts.conflicts);
      setInspectorStatus('ready');
    } catch (caught: unknown) {
      if (inspectorRequestRef.current !== requestId) return;
      setInspectorStatus('error');
      setInspectorError(
        caught instanceof StoryKeeperClientError
          ? caught.message
          : 'Structured memory could not be loaded. Try again.',
      );
    }
  }

  function changeInspectorActor(actor: InspectorActor): void {
    cancelProcessing();
    setInspectorActor(actor);
    setNotice(
      actor === 'rosa'
        ? 'Viewing Rosa’s narrator memory.'
        : 'Viewing Maya’s approved family memory.',
    );
    void loadInspector(actor, interviewId);
  }

  function showError(caught: unknown, fallback: string): void {
    if (caught instanceof StoryKeeperClientError) {
      setError({ code: caught.code, message: caught.message });
      setNotice('Story Keeper needs your attention.');
      return;
    }
    setError({ code: 'unexpected', message: fallback });
    setNotice('Story Keeper needs your attention.');
  }

  const isConnected = connectionStatus === 'connected';
  const connectionLabel = connectionStatusLabels[connectionStatus];

  return (
    <AppShell activeSurface="simulator">
      <header className="page-heading simulator-heading">
        <div>
          <p className="panel-label">Real MCP interview</p>
          <h1>Talk with Story Keeper</h1>
          <p>Continue Rosa’s story through the durable family interview.</p>
        </div>
        <div className="connection-card" aria-label="MCP connection">
          <p className="connection-state" data-state={connectionStatus} role="status">
            <span aria-hidden="true" />
            {connectionLabel}
          </p>
          <button
            className="secondary-button"
            type="button"
            disabled={connectionStatus === 'connecting' || connectionStatus === 'reconnecting'}
            onClick={() => void connect()}
          >
            {connectionStatus === 'connected' ? 'Reconnect' : 'Connect'}
          </button>
          {toolCount === 15 ? <small>15 tools verified</small> : null}
        </div>
      </header>

      {error === null ? null : (
        <div className="error-banner" role="alert">
          <strong>We couldn’t complete that step.</strong>
          <span>{error.message}</span>
          <small>Code: {error.code}</small>
        </div>
      )}

      <div className="simulator-layout">
        <section className="surface-panel conversation-panel" aria-labelledby="conversation-title">
          <div className="conversation-topline">
            <div>
              <p className="panel-label">Conversation with Rosa</p>
              <h2 id="conversation-title">One memory at a time</h2>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={!isConnected || requestStatus !== 'idle'}
              onClick={() => void startInterview()}
            >
              {requestStatus === 'starting' ? 'Resuming…' : 'Start / Resume interview'}
            </button>
          </div>

          <div className="question-region" aria-live="polite" aria-atomic="true">
            {question === null ? (
              <p className="empty-copy">
                {isConnected
                  ? 'Choose Start / Resume interview to ask Rosa’s current question.'
                  : 'Connect to the Story Keeper server to load Rosa’s real interview.'}
              </p>
            ) : question.status === 'complete' ? (
              <div>
                <p className="panel-label">Interview complete</p>
                <p className="current-question">Rosa has answered every question for now.</p>
              </div>
            ) : (
              <div>
                <p className="panel-label">Story Keeper asks</p>
                <p className="current-question">{question.questionText}</p>
              </div>
            )}
          </div>

          <form
            className="answer-form"
            onSubmit={(event) => {
              void submitAnswer(event);
            }}
          >
            <label htmlFor="story-answer">Rosa’s answer</label>
            <textarea
              id="story-answer"
              name="story-answer"
              rows={5}
              maxLength={maximumRawAnswerLength}
              value={answer}
              disabled={question?.status !== 'question' || requestStatus === 'saving'}
              onChange={(event) => {
                setAnswer(event.currentTarget.value);
              }}
              placeholder="Type Rosa’s memory here…"
            />
            <div className="answer-actions">
              <span>{answer.length.toLocaleString()} / 20,000 characters</span>
              <button
                className="primary-button"
                type="submit"
                disabled={
                  question?.status !== 'question' ||
                  requestStatus === 'saving' ||
                  answer.trim().length === 0
                }
              >
                {requestStatus === 'saving' ? 'Saving…' : 'Submit answer'}
              </button>
            </div>
          </form>
          <p className="save-status" role="status" aria-live="polite">
            {notice}
          </p>
          <ProcessingStatus
            phase={processingPhase}
            onCheckAgain={() => void beginProcessingRefresh(processingBaselineRef.current)}
          />
        </section>

        <aside className="surface-panel visual-placeholder" aria-labelledby="visual-title">
          <div className="memory-window" aria-hidden="true">
            <span />
          </div>
          <div>
            <p className="panel-label">Story visual</p>
            <h2 id="visual-title">Rosa’s family memories</h2>
            <p className="empty-copy">
              Interview questions and answers come only from the connected Story Keeper backend.
            </p>
          </div>
        </aside>
      </div>

      {inspectorActor === 'rosa' ? (
        <PendingMemoryList
          context={storyContext}
          highlightedIds={newMemoryIds}
          connected={isConnected}
          loading={inspectorStatus === 'loading'}
        />
      ) : null}

      <DeveloperMemoryInspector
        actor={inspectorActor}
        context={storyContext}
        conflicts={conflicts}
        interviewState={
          question?.status === 'complete' ? 'complete' : interviewId === null ? 'none' : 'active'
        }
        currentQuestion={question?.status === 'question' ? question.questionText : null}
        status={inspectorStatus}
        error={inspectorError}
        connected={isConnected}
        onActorChange={changeInspectorActor}
        onRefresh={() => void loadInspector(inspectorActor, interviewId)}
      />
    </AppShell>
  );
}

const connectionStatusLabels: Record<ConnectionStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Connection needs attention',
};

function createDefaultClient(): StoryKeeperClient {
  const endpoint = resolveMcpEndpoint(import.meta.env.VITE_MCP_URL, window.location.href);
  return new StoryKeeperMcpClient(endpoint);
}
