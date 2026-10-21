import {
  maximumRawAnswerLength,
  searchFamilyStoryInputSchema,
  storyKeeperDemoIds,
  type ContradictionResolutionType,
  type FamilyStorySearchResult,
} from '@story-keeper/shared';
import { AppShell } from '@story-keeper/ui';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import {
  maximumChapterTopicLength,
  maximumFamilyQuestionLength,
  resolveMcpEndpoint,
  StoryKeeperClientError,
  StoryKeeperMcpClient,
  type GetNextQuestionResult,
  type GetStoryContextResult,
  type ListPendingConflictsResult,
  type ReviewChapterResult,
  type StoryKeeperClient,
} from '@story-keeper/mcp-client';
import {
  ChapterDraftPanel,
  type ChapterNotice,
  type ChapterUiStatus,
} from './components/chapters/ChapterDraftPanel.js';
import {
  FamilyQuestionComposer,
  type FamilyQuestionNotice,
} from './components/FamilyQuestionComposer.js';
import {
  DeveloperMemoryInspector,
  type InspectorActor,
} from './components/DeveloperMemoryInspector.js';
import {
  ConflictReviewList,
  type ActiveConflictResolution,
  type ConflictNotice,
} from './components/conflicts/ConflictReviewList.js';
import { PendingMemoryList } from './components/memory/PendingMemoryList.js';
import { SearchPanel, type SearchUiStatus } from './components/SearchPanel.js';
import type {
  ActiveMemoryMutation,
  MemoryMutationAction,
  MemoryMutationNotice,
} from './components/memory/MemoryReviewActions.js';
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
import {
  defaultChapterPollingTiming,
  type ChapterPollingTiming,
} from './features/chapter/polling.js';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
type RequestStatus = 'idle' | 'starting' | 'saving';
type SimulatorView = 'interview' | 'search';

interface SimulatorAppProps {
  readonly createClient?: () => StoryKeeperClient;
  readonly processingTiming?: MemoryProcessingTiming;
  readonly chapterPollingTiming?: ChapterPollingTiming;
}

export function SimulatorApp({
  createClient = createDefaultClient,
  processingTiming = defaultMemoryProcessingTiming,
  chapterPollingTiming = defaultChapterPollingTiming,
}: SimulatorAppProps) {
  const clientRef = useRef<StoryKeeperClient | null>(null);
  if (clientRef.current === null) clientRef.current = createClient();
  const client = clientRef.current;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [activeView, setActiveView] = useState<SimulatorView>('interview');
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [toolCount, setToolCount] = useState<number | null>(null);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [question, setQuestion] = useState<GetNextQuestionResult | null>(null);
  const [answer, setAnswer] = useState('');
  const [narratorTarget, setNarratorTarget] = useState<{
    readonly id: string;
    readonly displayName: string;
  } | null>(null);
  const [familyQuestionText, setFamilyQuestionText] = useState('');
  const [familyQuestionSubmitting, setFamilyQuestionSubmitting] = useState(false);
  const [familyQuestionValidation, setFamilyQuestionValidation] = useState<string | null>(null);
  const [familyQuestionNotice, setFamilyQuestionNotice] = useState<FamilyQuestionNotice | null>(
    null,
  );
  const [notice, setNotice] = useState('Connect to begin Rosa’s interview.');
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [inspectorActor, setInspectorActor] = useState<InspectorActor>('rosa');
  const [storyContext, setStoryContext] = useState<GetStoryContextResult | null>(null);
  const [conflicts, setConflicts] = useState<ListPendingConflictsResult['conflicts'] | null>(null);
  const [inspectorStatus, setInspectorStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const connectionRequestRef = useRef(0);
  const inspectorRequestRef = useRef(0);
  const interviewRequestRef = useRef(0);
  const familyQuestionMutationRef = useRef(0);
  const conflictMutationRef = useRef(0);
  const memoryMutationRef = useRef(0);
  const processingRunRef = useRef(0);
  const processingAbortRef = useRef<AbortController | null>(null);
  const processingBaselineRef = useRef<MemoryItemIds | null>(null);
  const [processingPhase, setProcessingPhase] = useState<MemoryProcessingPhase>('idle');
  const [newMemoryIds, setNewMemoryIds] = useState<ReadonlySet<string>>(new Set());
  const [activeConflictResolution, setActiveConflictResolution] =
    useState<ActiveConflictResolution | null>(null);
  const [conflictNotice, setConflictNotice] = useState<ConflictNotice | null>(null);
  const [activeMemoryMutation, setActiveMemoryMutation] = useState<ActiveMemoryMutation | null>(
    null,
  );
  const [memoryMutationNotice, setMemoryMutationNotice] = useState<MemoryMutationNotice | null>(
    null,
  );
  const [chapterTopic, setChapterTopic] = useState('');
  const [chapterStatus, setChapterStatus] = useState<ChapterUiStatus>('idle');
  const [chapterReview, setChapterReview] = useState<ReviewChapterResult | null>(null);
  const [chapterValidation, setChapterValidation] = useState<string | null>(null);
  const [chapterNotice, setChapterNotice] = useState<ChapterNotice | null>(null);
  const [confirmChapterReject, setConfirmChapterReject] = useState(false);
  const chapterFlowRef = useRef(0);
  const chapterMutationRef = useRef(0);
  const chapterAbortRef = useRef<AbortController | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<SearchUiStatus>('idle');
  const [searchResults, setSearchResults] = useState<readonly FamilyStorySearchResult[]>([]);
  const [searchValidation, setSearchValidation] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestRef = useRef(0);

  useEffect(
    () => () => {
      connectionRequestRef.current += 1;
      inspectorRequestRef.current += 1;
      interviewRequestRef.current += 1;
      familyQuestionMutationRef.current += 1;
      conflictMutationRef.current += 1;
      memoryMutationRef.current += 1;
      chapterFlowRef.current += 1;
      chapterMutationRef.current += 1;
      chapterAbortRef.current?.abort();
      searchRequestRef.current += 1;
      processingRunRef.current += 1;
      processingAbortRef.current?.abort();
      void client.disconnect();
    },
    [client],
  );

  async function connect(): Promise<void> {
    const connectionId = connectionRequestRef.current + 1;
    connectionRequestRef.current = connectionId;
    const isReconnect = connectionStatus === 'connected' || connectionStatus === 'error';
    cancelProcessing();
    cancelConflictMutation();
    cancelMemoryMutation();
    cancelInterviewRequest(false);
    cancelFamilyQuestionMutation(true);
    cancelChapterWork(true);
    cancelSearch(true);
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
      if (connectionRequestRef.current !== connectionId) return;
      setToolCount(tools.length);
      setConnectionStatus('connected');
      setNotice('Connected. Story Keeper’s interview tools are ready.');

      if (interviewId !== null && inspectorActor === 'rosa') {
        const requestId = interviewRequestRef.current + 1;
        interviewRequestRef.current = requestId;
        const resumedInterviewId = await resumeInterview(client, requestId);
        if (resumedInterviewId === null) return;
        await loadInspector(inspectorActor, resumedInterviewId);
        if (
          connectionRequestRef.current !== connectionId ||
          interviewRequestRef.current !== requestId
        )
          return;
        setNotice('Reconnected. Rosa’s interview was restored from Story Keeper.');
      } else {
        await loadInspector(inspectorActor, null);
      }
    } catch (caught: unknown) {
      if (connectionRequestRef.current !== connectionId) return;
      showError(caught, 'Story Keeper is unavailable. Check the server and try again.');
      setConnectionStatus('error');
      setToolCount(null);
    }
  }

  async function startInterview(): Promise<void> {
    if (inspectorActor !== 'rosa') return;
    const requestId = interviewRequestRef.current + 1;
    interviewRequestRef.current = requestId;
    setRequestStatus('starting');
    setError(null);
    setNotice('Resuming Rosa’s story…');
    try {
      const resumedInterviewId = await resumeInterview(client, requestId);
      if (resumedInterviewId === null) return;
      await loadInspector(inspectorActor, resumedInterviewId);
      if (interviewRequestRef.current !== requestId) return;
      setNotice('Rosa’s interview is ready.');
    } catch (caught: unknown) {
      if (interviewRequestRef.current !== requestId) return;
      showError(caught, 'Rosa’s interview could not be started. Try again.');
    } finally {
      if (interviewRequestRef.current === requestId) setRequestStatus('idle');
    }
  }

  async function resumeInterview(
    activeClient: StoryKeeperClient,
    requestId: number,
  ): Promise<string | null> {
    const started = await activeClient.startInterview({
      familyId: storyKeeperDemoIds.familyId,
      personId: storyKeeperDemoIds.rosaPersonId,
    });
    if (interviewRequestRef.current !== requestId) return null;
    setNarratorTarget(started.narrator);
    const nextQuestion = await activeClient.getNextQuestion({
      familyId: storyKeeperDemoIds.familyId,
      interviewId: started.interviewId,
    });
    if (interviewRequestRef.current !== requestId) return null;
    setInterviewId(started.interviewId);
    setQuestion(nextQuestion);
    return started.interviewId;
  }

  async function submitAnswer(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (inspectorActor !== 'rosa' || question?.status !== 'question' || requestStatus === 'saving')
      return;
    if (answer.trim().length === 0) {
      setError({ code: 'validation', message: 'Please enter an answer before submitting.' });
      return;
    }

    const requestId = interviewRequestRef.current + 1;
    interviewRequestRef.current = requestId;
    setRequestStatus('saving');
    setError(null);
    setNotice('Saving your answer…');
    const baseline =
      storyContext?.actor.id === storyKeeperDemoIds.rosaPersonId
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
      if (interviewRequestRef.current !== requestId) return;
      showError(caught, 'Your answer could not be saved. It remains in the answer box.');
      setRequestStatus('idle');
      return;
    }

    if (interviewRequestRef.current !== requestId) return;

    setAnswer('');
    setNotice('Answer saved. Story Keeper is organizing the memory.');
    inspectorRequestRef.current += 1;
    if (processingRunRef.current === processingContextId) {
      void beginProcessingRefresh(baseline);
    }

    try {
      const nextQuestion = await client.getNextQuestion({
        familyId: storyKeeperDemoIds.familyId,
        interviewId: question.interviewId,
      });
      if (interviewRequestRef.current !== requestId) return;
      setQuestion(nextQuestion);
    } catch (caught: unknown) {
      if (interviewRequestRef.current !== requestId) return;
      setError({
        code: caught instanceof StoryKeeperClientError ? caught.code : 'next_question_unavailable',
        message: 'Your answer was saved, but the next question could not be loaded.',
      });
    } finally {
      if (interviewRequestRef.current === requestId) setRequestStatus('idle');
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

  function cancelConflictMutation(): void {
    conflictMutationRef.current += 1;
    setActiveConflictResolution(null);
    setConflictNotice(null);
  }

  function cancelMemoryMutation(): void {
    memoryMutationRef.current += 1;
    setActiveMemoryMutation(null);
    setMemoryMutationNotice(null);
  }

  function cancelInterviewRequest(clearPrivateState: boolean): void {
    interviewRequestRef.current += 1;
    setRequestStatus('idle');
    setError(null);
    if (clearPrivateState) {
      setQuestion(null);
      setAnswer('');
    }
  }

  function cancelFamilyQuestionMutation(clearText: boolean): void {
    familyQuestionMutationRef.current += 1;
    setFamilyQuestionSubmitting(false);
    setFamilyQuestionValidation(null);
    setFamilyQuestionNotice(null);
    if (clearText) setFamilyQuestionText('');
  }

  async function submitFamilyQuestion(): Promise<void> {
    if (familyQuestionSubmitting || connectionStatus !== 'connected') return;
    const trimmedQuestion = familyQuestionText.trim();
    if (trimmedQuestion.length === 0 || trimmedQuestion.length > maximumFamilyQuestionLength) {
      setFamilyQuestionValidation('Enter a question between 1 and 500 characters.');
      return;
    }
    if (
      inspectorActor !== 'maya' ||
      storyContext === null ||
      (storyContext.actor.role !== 'relative' && storyContext.actor.role !== 'child') ||
      narratorTarget === null
    ) {
      setFamilyQuestionNotice({
        kind: 'error',
        message: 'This question can’t be sent to a narrator right now.',
      });
      return;
    }

    const mutationId = familyQuestionMutationRef.current + 1;
    familyQuestionMutationRef.current = mutationId;
    const senderPersonId = storyContext.actor.id;
    const target = narratorTarget;
    setFamilyQuestionSubmitting(true);
    setFamilyQuestionValidation(null);
    setFamilyQuestionNotice(null);

    try {
      await client.queueFamilyQuestion({
        familyId: storyKeeperDemoIds.familyId,
        fromPersonId: senderPersonId,
        toPersonId: target.id,
        questionText: trimmedQuestion,
      });
      if (familyQuestionMutationRef.current !== mutationId) return;
      setFamilyQuestionText('');
      setFamilyQuestionNotice({
        kind: 'success',
        message: `Question added for ${target.displayName}.`,
      });
    } catch (caught: unknown) {
      if (familyQuestionMutationRef.current !== mutationId) return;
      setFamilyQuestionNotice({ kind: 'error', message: familyQuestionErrorMessage(caught) });
    } finally {
      if (familyQuestionMutationRef.current === mutationId) setFamilyQuestionSubmitting(false);
    }
  }

  function stopChapterPolling(): void {
    chapterFlowRef.current += 1;
    chapterAbortRef.current?.abort();
    chapterAbortRef.current = null;
  }

  function cancelChapterWork(clearPrivateState: boolean): void {
    stopChapterPolling();
    chapterMutationRef.current += 1;
    setConfirmChapterReject(false);
    setChapterValidation(null);
    setChapterNotice(null);
    if (clearPrivateState) {
      setChapterTopic('');
      setChapterStatus('idle');
      setChapterReview(null);
    }
  }

  function cancelSearch(clearQuery: boolean): void {
    searchRequestRef.current += 1;
    setSearchStatus('idle');
    setSearchResults([]);
    setSearchValidation(null);
    setSearchError(null);
    if (clearQuery) setSearchQuery('');
  }

  async function submitSearch(): Promise<void> {
    if (connectionStatus !== 'connected' || searchStatus === 'loading') return;

    const actorPersonId =
      inspectorActor === 'rosa' ? storyKeeperDemoIds.rosaPersonId : storyKeeperDemoIds.mayaPersonId;
    const parsed = searchFamilyStoryInputSchema.safeParse({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId,
      query: searchQuery,
      limit: 10,
    });
    if (!parsed.success) {
      setSearchResults([]);
      setSearchStatus('idle');
      setSearchError(null);
      setSearchValidation(
        searchQuery.length > 200
          ? 'Search queries can be no more than 200 characters.'
          : 'Enter a search with at least one letter or number.',
      );
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setSearchStatus('loading');
    setSearchResults([]);
    setSearchValidation(null);
    setSearchError(null);
    try {
      const response = await client.searchFamilyStory(parsed.data);
      if (searchRequestRef.current !== requestId) return;
      setSearchResults(response.results);
      setSearchStatus('ready');
    } catch (caught: unknown) {
      if (searchRequestRef.current !== requestId) return;
      setSearchResults([]);
      if (caught instanceof StoryKeeperClientError && caught.code === 'validation') {
        setSearchStatus('idle');
        setSearchValidation('Enter a search with at least one letter or number.');
        return;
      }
      if (caught instanceof StoryKeeperClientError && caught.code === 'unavailable') {
        cancelSearch(true);
        setConnectionStatus('error');
        setToolCount(null);
        showError(caught, 'Search is unavailable. Reconnect and try again.');
        return;
      }
      setSearchStatus('error');
      setSearchError(
        caught instanceof StoryKeeperClientError && caught.code === 'authorization'
          ? 'This family member is not authorized to search these stories.'
          : 'Family story search could not be completed. Try again.',
      );
    }
  }

  function synchronizeChapterContext(context: GetStoryContextResult): void {
    stopChapterPolling();
    setConfirmChapterReject(false);
    setChapterReview(null);

    if (context.actor.role !== 'narrator') {
      setChapterStatus('idle');
      return;
    }

    const activeDraft = context.recoverableChapterDrafts?.[0];
    if (activeDraft === undefined) {
      setChapterStatus('idle');
      return;
    }
    if (activeDraft.status === 'failed') {
      setChapterStatus('failed');
      return;
    }

    const runId = chapterFlowRef.current;
    if (activeDraft.status === 'pending_review') {
      setChapterStatus('loading_review');
      void loadChapterReview(activeDraft.chapterDraftId, runId);
      return;
    }

    const controller = new AbortController();
    chapterAbortRef.current = controller;
    setChapterStatus('generating');
    void pollChapterContext(runId, controller);
  }

  async function loadChapterReview(chapterDraftId: string, runId: number): Promise<void> {
    try {
      const review = await client.reviewChapter({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
        chapterDraftId,
      });
      if (chapterFlowRef.current !== runId) return;
      if (review.status !== 'pending_review' || review.title === null || review.body === null) {
        setChapterStatus(review.status === 'failed' ? 'failed' : 'delayed');
        setChapterReview(null);
        if (review.status !== 'failed') {
          setChapterNotice({
            kind: 'error',
            message: 'The latest chapter review state could not be confirmed. Check again later.',
          });
        }
        return;
      }
      setChapterReview(review);
      setChapterStatus('pending_review');
    } catch (caught: unknown) {
      if (chapterFlowRef.current !== runId) return;
      setChapterStatus('delayed');
      setChapterNotice({ kind: 'error', message: chapterErrorMessage(caught) });
    }
  }

  async function pollChapterContext(runId: number, controller: AbortController): Promise<void> {
    for (let attempt = 0; attempt < chapterPollingTiming.maxAttempts; attempt += 1) {
      const shouldContinue = await waitForProcessingInterval(
        chapterPollingTiming.pollIntervalMs,
        controller.signal,
      );
      if (!shouldContinue || chapterFlowRef.current !== runId) return;

      try {
        const context = await client.getStoryContext({
          familyId: storyKeeperDemoIds.familyId,
          actorPersonId: storyKeeperDemoIds.rosaPersonId,
        });
        if (controller.signal.aborted || chapterFlowRef.current !== runId) return;
        setStoryContext(context);
        setInspectorStatus('ready');
        setInspectorError(null);
        const activeDraft = context.recoverableChapterDrafts?.[0];
        if (activeDraft === undefined) {
          setChapterReview(null);
          setChapterStatus('idle');
          return;
        }
        if (activeDraft.status === 'failed') {
          setChapterReview(null);
          setChapterStatus('failed');
          return;
        }
        if (activeDraft.status === 'pending_review') {
          setChapterStatus('loading_review');
          await loadChapterReview(activeDraft.chapterDraftId, runId);
          return;
        }
      } catch {
        if (controller.signal.aborted || chapterFlowRef.current !== runId) return;
        setChapterStatus('delayed');
        setChapterNotice({
          kind: 'error',
          message: 'The chapter status could not be checked. Reconnect or check again later.',
        });
        return;
      }
    }

    if (!controller.signal.aborted && chapterFlowRef.current === runId) {
      setChapterStatus('delayed');
    }
  }

  async function refreshChapterContext(): Promise<void> {
    if (inspectorActor !== 'rosa' || connectionStatus !== 'connected') return;
    const flowId = chapterFlowRef.current + 1;
    stopChapterPolling();
    chapterFlowRef.current = flowId;
    setChapterStatus('loading_review');
    setChapterNotice(null);
    try {
      const context = await client.getStoryContext({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
      });
      if (chapterFlowRef.current !== flowId) return;
      setStoryContext(context);
      synchronizeChapterContext(context);
    } catch (caught: unknown) {
      if (chapterFlowRef.current !== flowId) return;
      setChapterStatus('delayed');
      setChapterNotice({ kind: 'error', message: chapterErrorMessage(caught) });
    }
  }

  async function requestChapter(): Promise<void> {
    if (chapterStatus === 'requesting' || connectionStatus !== 'connected') return;
    const topic = chapterTopic.trim();
    if (topic.length === 0 || topic.length > maximumChapterTopicLength) {
      setChapterValidation('Enter a chapter topic between 1 and 200 characters.');
      return;
    }
    if (inspectorActor !== 'rosa' || storyContext?.actor.role !== 'narrator') {
      setChapterNotice({
        kind: 'error',
        message: 'Switch to the active narrator view before requesting a chapter.',
      });
      return;
    }

    stopChapterPolling();
    const mutationId = chapterMutationRef.current + 1;
    chapterMutationRef.current = mutationId;
    setChapterStatus('requesting');
    setChapterValidation(null);
    setChapterNotice(null);
    setChapterReview(null);
    try {
      const result = await client.requestChapterDraft({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyContext.actor.id,
        narratorPersonId: storyContext.actor.id,
        chapterTopic: topic,
      });
      if (chapterMutationRef.current !== mutationId) return;
      if (result.status === 'insufficient_sources') {
        setChapterStatus('idle');
        setChapterNotice({
          kind: 'error',
          message: 'There isn’t enough approved story material to create a chapter yet.',
        });
        return;
      }

      setChapterTopic('');
      setChapterStatus('generating');
      setChapterNotice({
        kind: 'success',
        message: 'Chapter request accepted. Story Keeper is drafting it for review.',
      });
    } catch (caught: unknown) {
      if (chapterMutationRef.current !== mutationId) return;
      setChapterStatus('idle');
      setChapterNotice({ kind: 'error', message: chapterRequestErrorMessage(caught) });
      return;
    }

    try {
      const context = await client.getStoryContext({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
      });
      if (chapterMutationRef.current !== mutationId) return;
      setStoryContext(context);
      synchronizeChapterContext(context);
    } catch {
      if (chapterMutationRef.current !== mutationId) return;
      setChapterStatus('delayed');
      setChapterNotice({
        kind: 'error',
        message:
          'The chapter request was accepted, but its latest status could not be loaded. Reconnect to continue.',
      });
    }
  }

  async function mutateChapter(action: 'approve' | 'reject'): Promise<void> {
    if (
      inspectorActor !== 'rosa' ||
      connectionStatus !== 'connected' ||
      chapterReview?.status !== 'pending_review'
    ) {
      setChapterNotice({
        kind: 'error',
        message: 'Refresh the narrator’s chapter review before continuing.',
      });
      return;
    }

    stopChapterPolling();
    const mutationId = chapterMutationRef.current + 1;
    chapterMutationRef.current = mutationId;
    const chapterDraftId = chapterReview.chapterDraftId;
    setConfirmChapterReject(false);
    setChapterStatus(action === 'approve' ? 'approving' : 'rejecting');
    setChapterNotice(null);
    let result: Awaited<ReturnType<StoryKeeperClient['approveStoryItem']>>;
    try {
      result = await client.approveStoryItem({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
        targetType: 'chapter',
        targetId: chapterDraftId,
        action,
      });
      if (chapterMutationRef.current !== mutationId) return;
    } catch (caught: unknown) {
      if (chapterMutationRef.current !== mutationId) return;
      if (
        caught instanceof StoryKeeperClientError &&
        (caught.code === 'story_item_state' ||
          caught.code === 'chapter_state' ||
          caught.code === 'unavailable')
      ) {
        try {
          const context = await client.getStoryContext({
            familyId: storyKeeperDemoIds.familyId,
            actorPersonId: storyKeeperDemoIds.rosaPersonId,
          });
          if (chapterMutationRef.current !== mutationId) return;
          setStoryContext(context);
          synchronizeChapterContext(context);
          setChapterNotice({
            kind: 'error',
            message:
              caught.code === 'unavailable'
                ? 'The connection was interrupted, so Story Keeper refreshed the latest chapter state.'
                : 'This chapter changed since you opened it. We refreshed the latest state.',
          });
        } catch {
          if (chapterMutationRef.current !== mutationId) return;
          setChapterStatus('delayed');
          setChapterReview(null);
          setChapterNotice({
            kind: 'error',
            message:
              caught.code === 'unavailable'
                ? 'The connection was interrupted and the latest chapter state could not be confirmed. Reconnect before continuing.'
                : 'This chapter changed, but the latest state could not be refreshed. Reconnect before continuing.',
          });
        }
      } else {
        setChapterStatus('pending_review');
        setChapterNotice({ kind: 'error', message: chapterMutationErrorMessage(caught) });
      }
      return;
    }

    try {
      const context = await client.getStoryContext({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
      });
      if (chapterMutationRef.current !== mutationId) return;
      setStoryContext(context);
      synchronizeChapterContext(context);
      setChapterNotice({
        kind: 'success',
        message:
          result.status === 'already_applied'
            ? `This chapter was already ${action === 'approve' ? 'approved' : 'rejected'}. Story Keeper refreshed the latest state.`
            : action === 'approve'
              ? 'Chapter approved. Story Keeper refreshed the latest family story.'
              : 'Chapter rejected. It will not appear in family-visible story views.',
      });
    } catch {
      if (chapterMutationRef.current !== mutationId) return;
      setChapterStatus('delayed');
      setChapterReview(null);
      setChapterNotice({
        kind: 'error',
        message:
          'Your chapter choice was saved, but the latest story state could not be loaded. Reconnect before continuing.',
      });
    }
  }

  async function mutateMemory(
    targetType: ActiveMemoryMutation['targetType'],
    targetId: string,
    action: MemoryMutationAction,
  ): Promise<void> {
    if (inspectorActor !== 'rosa' || connectionStatus !== 'connected') {
      setMemoryMutationNotice({
        kind: 'error',
        message: 'Switch to Rosa’s narrator view before changing this memory.',
      });
      return;
    }

    const mutationId = memoryMutationRef.current + 1;
    memoryMutationRef.current = mutationId;
    setActiveMemoryMutation({ targetType, targetId, action });
    setMemoryMutationNotice(null);

    try {
      const result =
        action === 'remove'
          ? await client.deletePendingMemory({
              familyId: storyKeeperDemoIds.familyId,
              actorPersonId: storyKeeperDemoIds.rosaPersonId,
              targetType,
              targetId,
            })
          : await client.approveStoryItem({
              familyId: storyKeeperDemoIds.familyId,
              actorPersonId: storyKeeperDemoIds.rosaPersonId,
              targetType,
              targetId,
              action,
            });
      if (memoryMutationRef.current !== mutationId) return;

      const refreshed = await loadInspector('rosa', interviewId);
      if (memoryMutationRef.current !== mutationId) return;
      if (!refreshed) {
        setMemoryMutationNotice({
          kind: 'error',
          message:
            'Your change was saved, but the latest story state could not be refreshed. Reconnect before continuing.',
        });
        return;
      }
      setMemoryMutationNotice({
        kind: 'success',
        message: memoryMutationSuccessMessage(action, result.status),
      });
    } catch (caught: unknown) {
      if (memoryMutationRef.current !== mutationId) return;
      if (caught instanceof StoryKeeperClientError && caught.code === 'story_item_state') {
        const refreshed = await loadInspector('rosa', interviewId);
        if (memoryMutationRef.current !== mutationId) return;
        setMemoryMutationNotice({
          kind: 'error',
          message: refreshed
            ? 'This memory changed since you opened it. We’ve refreshed the latest story state.'
            : 'This memory changed since you opened it, but the latest story state could not be refreshed. Reconnect before continuing.',
        });
      } else {
        setMemoryMutationNotice({ kind: 'error', message: memoryMutationErrorMessage(caught) });
      }
    } finally {
      if (memoryMutationRef.current === mutationId) setActiveMemoryMutation(null);
    }
  }

  async function resolveConflict(
    contradictionId: string,
    resolutionType: ContradictionResolutionType,
  ): Promise<void> {
    if (interviewId === null || inspectorActor !== 'rosa' || connectionStatus !== 'connected') {
      setConflictNotice({
        kind: 'error',
        message: 'Resume Rosa’s interview before resolving this conflict.',
      });
      return;
    }

    const mutationId = conflictMutationRef.current + 1;
    conflictMutationRef.current = mutationId;
    const activeInterviewId = interviewId;
    setActiveConflictResolution({ contradictionId, resolutionType });
    setConflictNotice(null);

    try {
      const result = await client.resolveConflict({
        familyId: storyKeeperDemoIds.familyId,
        interviewId: activeInterviewId,
        contradictionId,
        resolutionType,
      });
      if (conflictMutationRef.current !== mutationId) return;

      const refreshed = await loadInspector('rosa', activeInterviewId);
      if (conflictMutationRef.current !== mutationId) return;
      if (!refreshed) {
        setConflictNotice({
          kind: 'error',
          message:
            'Your choice was saved, but the latest story state could not be refreshed. Reconnect before continuing.',
        });
        return;
      }
      setConflictNotice({
        kind: 'success',
        message:
          result.status === 'already_resolved'
            ? 'That choice was already saved. Story Keeper refreshed the latest story state.'
            : 'Conflict resolved. Story Keeper refreshed the latest story state.',
      });
    } catch (caught: unknown) {
      if (conflictMutationRef.current !== mutationId) return;
      if (caught instanceof StoryKeeperClientError && caught.code === 'conflict_state') {
        const refreshed = await loadInspector('rosa', activeInterviewId);
        if (conflictMutationRef.current !== mutationId) return;
        setConflictNotice({
          kind: 'error',
          message: refreshed
            ? 'This conflict changed since you opened it. We’ve refreshed the latest story state.'
            : 'This conflict changed since you opened it, but the latest story state could not be refreshed. Reconnect before continuing.',
        });
      } else {
        setConflictNotice({ kind: 'error', message: conflictErrorMessage(caught) });
      }
    } finally {
      if (conflictMutationRef.current === mutationId) setActiveConflictResolution(null);
    }
  }

  async function loadInspector(
    actor: InspectorActor,
    activeInterviewId: string | null,
  ): Promise<boolean> {
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
      if (inspectorRequestRef.current !== requestId) return false;
      if (nextContext.actor.role === 'narrator') {
        setNarratorTarget({ id: nextContext.actor.id, displayName: nextContext.actor.displayName });
      }
      setStoryContext(nextContext);
      setConflicts(nextConflicts.conflicts);
      setInspectorStatus('ready');
      synchronizeChapterContext(nextContext);
      return true;
    } catch (caught: unknown) {
      if (inspectorRequestRef.current !== requestId) return false;
      setInspectorStatus('error');
      setInspectorError(
        caught instanceof StoryKeeperClientError
          ? caught.message
          : 'Structured memory could not be loaded. Try again.',
      );
      return false;
    }
  }

  function changeInspectorActor(actor: InspectorActor): void {
    cancelProcessing();
    cancelConflictMutation();
    cancelMemoryMutation();
    cancelInterviewRequest(true);
    cancelFamilyQuestionMutation(true);
    cancelChapterWork(true);
    cancelSearch(true);
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
          <p className="panel-label">
            {activeView === 'interview' ? 'Real MCP interview' : 'Real MCP search'}
          </p>
          <h1>{activeView === 'interview' ? 'Talk with Story Keeper' : 'Search family stories'}</h1>
          <p>
            {activeView === 'interview'
              ? 'Continue Rosa’s story through the durable family interview.'
              : 'Explore approved family history without exposing private drafts or pending memories.'}
          </p>
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

      <nav className="simulator-view-nav" aria-label="Simulator sections">
        <button
          type="button"
          aria-label="Open interview"
          aria-current={activeView === 'interview' ? 'page' : undefined}
          onClick={() => {
            setActiveView('interview');
          }}
        >
          Interview
        </button>
        <button
          type="button"
          aria-label="Open search"
          aria-current={activeView === 'search' ? 'page' : undefined}
          onClick={() => {
            setActiveView('search');
          }}
        >
          Search
        </button>
      </nav>

      {activeView === 'search' ? (
        <SearchPanel
          actor={inspectorActor}
          connected={isConnected}
          query={searchQuery}
          status={searchStatus}
          results={searchResults}
          validationMessage={searchValidation}
          errorMessage={searchError}
          onActorChange={changeInspectorActor}
          onQueryChange={(query) => {
            setSearchQuery(query);
            setSearchStatus('idle');
            setSearchResults([]);
            setSearchValidation(null);
            setSearchError(null);
          }}
          onSubmit={() => void submitSearch()}
        />
      ) : (
        <div className="simulator-layout">
          {inspectorActor === 'rosa' ? (
            <section
              className="surface-panel conversation-panel"
              aria-labelledby="conversation-title"
            >
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
          ) : (
            <FamilyQuestionComposer
              narratorName={narratorTarget?.displayName ?? null}
              questionText={familyQuestionText}
              connected={
                isConnected &&
                (storyContext?.actor.role === 'relative' || storyContext?.actor.role === 'child')
              }
              submitting={familyQuestionSubmitting}
              validationMessage={familyQuestionValidation}
              notice={familyQuestionNotice}
              contextStatus={notice}
              onQuestionChange={(questionText) => {
                setFamilyQuestionText(questionText);
                setFamilyQuestionValidation(null);
                setFamilyQuestionNotice(null);
              }}
              onSubmit={() => void submitFamilyQuestion()}
            />
          )}

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
      )}

      {activeView === 'interview' && inspectorActor === 'rosa' ? (
        <ChapterDraftPanel
          narratorName={storyContext?.actor.displayName ?? 'the narrator'}
          connected={isConnected && storyContext?.actor.role === 'narrator'}
          topic={chapterTopic}
          status={chapterStatus}
          review={chapterReview}
          validationMessage={chapterValidation}
          notice={chapterNotice}
          confirmReject={confirmChapterReject}
          onTopicChange={(topic) => {
            setChapterTopic(topic);
            setChapterValidation(null);
            setChapterNotice(null);
          }}
          onRequest={() => void requestChapter()}
          onCheckStatus={() => void refreshChapterContext()}
          onApprove={() => void mutateChapter('approve')}
          onOpenReject={() => {
            setConfirmChapterReject(true);
          }}
          onCancelReject={() => {
            setConfirmChapterReject(false);
          }}
          onConfirmReject={() => void mutateChapter('reject')}
        />
      ) : null}

      {activeView === 'interview' && inspectorActor === 'rosa' ? (
        <>
          <ConflictReviewList
            conflicts={conflicts}
            connected={isConnected}
            interviewReady={interviewId !== null}
            loading={inspectorStatus === 'loading'}
            activeResolution={activeConflictResolution}
            notice={conflictNotice}
            onResolve={(contradictionId, resolutionType) => {
              void resolveConflict(contradictionId, resolutionType);
            }}
          />
        </>
      ) : null}

      {activeView === 'interview' ? (
        <>
          <PendingMemoryList
            context={storyContext}
            highlightedIds={newMemoryIds}
            connected={isConnected}
            loading={inspectorStatus === 'loading'}
            canManage={inspectorActor === 'rosa'}
            activeMutation={activeMemoryMutation}
            notice={memoryMutationNotice}
            onMutate={(targetType, targetId, action) => {
              void mutateMemory(targetType, targetId, action);
            }}
          />

          <DeveloperMemoryInspector
            actor={inspectorActor}
            context={storyContext}
            conflicts={conflicts}
            interviewState={
              question?.status === 'complete'
                ? 'complete'
                : interviewId === null
                  ? 'none'
                  : 'active'
            }
            currentQuestion={question?.status === 'question' ? question.questionText : null}
            status={inspectorStatus}
            error={inspectorError}
            connected={isConnected}
            onActorChange={changeInspectorActor}
            onRefresh={() => void loadInspector(inspectorActor, interviewId)}
          />
        </>
      ) : null}
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

function conflictErrorMessage(caught: unknown): string {
  if (!(caught instanceof StoryKeeperClientError)) {
    return 'Story Keeper could not resolve this conflict. No story state was changed here.';
  }
  if (caught.code === 'unavailable') {
    return 'The connection was interrupted. Refresh the latest story state before trying again.';
  }
  if (caught.code === 'authorization') {
    return 'This family member is not authorized to resolve Rosa’s conflicts.';
  }
  if (caught.code === 'interview_state') {
    return 'Rosa’s interview changed. Resume it and refresh before trying again.';
  }
  if (caught.code === 'validation') {
    return 'That resolution is not available for this conflict.';
  }
  return 'Story Keeper could not resolve this conflict. No story state was changed here.';
}

function memoryMutationSuccessMessage(
  action: MemoryMutationAction,
  status: 'updated' | 'already_applied' | 'deleted' | 'already_deleted',
): string {
  const replayed = status === 'already_applied' || status === 'already_deleted';
  if (action === 'approve') {
    return replayed
      ? 'This memory was already approved. Story Keeper refreshed the latest story state.'
      : 'Memory approved. Story Keeper refreshed the latest story state.';
  }
  if (action === 'reject') {
    return replayed
      ? 'This memory was already rejected. Story Keeper refreshed the latest story state.'
      : 'Memory rejected. Story Keeper refreshed the latest story state.';
  }
  if (action === 'revoke') {
    return replayed
      ? 'This approval was already revoked. Story Keeper refreshed the latest story state.'
      : 'Approval revoked. Story Keeper refreshed the latest story state.';
  }
  return replayed
    ? 'This pending memory was already removed. Story Keeper refreshed the latest story state.'
    : 'Pending memory removed. Story Keeper refreshed the latest story state.';
}

function memoryMutationErrorMessage(caught: unknown): string {
  if (!(caught instanceof StoryKeeperClientError)) {
    return 'Story Keeper could not change this memory. No story state was changed here.';
  }
  if (caught.code === 'provenance') {
    return 'This memory cannot be approved yet because its source information is incomplete.';
  }
  if (caught.code === 'identity') {
    return 'This relationship cannot be approved until its person references are resolved.';
  }
  if (caught.code === 'authorization') {
    return 'This family member is not authorized to change Rosa’s memories.';
  }
  if (caught.code === 'unavailable') {
    return 'The connection was interrupted. Refresh the latest story state before trying again.';
  }
  if (caught.code === 'validation') {
    return 'That memory action is not available.';
  }
  return 'Story Keeper could not change this memory. No story state was changed here.';
}

function familyQuestionErrorMessage(caught: unknown): string {
  if (!(caught instanceof StoryKeeperClientError)) {
    return 'Story Keeper could not add this question. Try again.';
  }
  if (caught.code === 'validation') {
    return 'Enter a question between 1 and 500 characters.';
  }
  if (caught.code === 'authorization') {
    return 'This question can’t be sent to that narrator right now.';
  }
  if (caught.code === 'unavailable') {
    return 'The connection was interrupted. Your question was not confirmed as added.';
  }
  return 'Story Keeper could not add this question. Try again.';
}

function chapterRequestErrorMessage(caught: unknown): string {
  if (!(caught instanceof StoryKeeperClientError)) {
    return 'Story Keeper could not request this chapter. No chapter was created here.';
  }
  if (caught.code === 'validation') {
    return 'Enter a chapter topic between 1 and 200 characters.';
  }
  if (caught.code === 'authorization') {
    return 'Only the active narrator can request this chapter.';
  }
  if (caught.code === 'unavailable') {
    return 'The connection was interrupted. Reconnect to check whether a draft was created.';
  }
  return 'Story Keeper could not request this chapter. No chapter was created here.';
}

function chapterErrorMessage(caught: unknown): string {
  if (caught instanceof StoryKeeperClientError && caught.code === 'authorization') {
    return 'Only the active narrator can review this chapter.';
  }
  if (caught instanceof StoryKeeperClientError && caught.code === 'unavailable') {
    return 'The connection was interrupted while loading the chapter. Check again later.';
  }
  return 'The chapter review could not be loaded. Check again later.';
}

function chapterMutationErrorMessage(caught: unknown): string {
  if (caught instanceof StoryKeeperClientError && caught.code === 'authorization') {
    return 'Only the active narrator can approve or reject this chapter.';
  }
  if (caught instanceof StoryKeeperClientError && caught.code === 'unavailable') {
    return 'The connection was interrupted. Refresh the chapter before trying again.';
  }
  return 'Story Keeper could not change this chapter. No chapter state was changed here.';
}
