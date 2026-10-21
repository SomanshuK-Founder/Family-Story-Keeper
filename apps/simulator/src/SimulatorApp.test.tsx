// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  GetNextQuestionResult,
  GetStoryContextResult,
  ListPendingConflictsResult,
  StoryKeeperClient,
} from '@story-keeper/mcp-client';
import { STORY_KEEPER_TOOL_NAMES, StoryKeeperClientError } from '@story-keeper/mcp-client';
import { storyKeeperDemoIds } from '@story-keeper/shared';

import { SimulatorApp } from './SimulatorApp.js';
import './test-setup.js';

const interviewId = '10000000-0000-4000-8000-000000000001';
const firstQuestionId = '10000000-0000-4000-8000-000000000002';
const secondQuestionId = '10000000-0000-4000-8000-000000000003';
const answerId = '10000000-0000-4000-8000-000000000004';
const privateCandidatePersonId = '10000000-0000-4000-8000-000000000005';
const chapterDraftId = '10000000-0000-4000-8000-000000000006';
const chapterJobId = '10000000-0000-4000-8000-000000000007';

const rosaContext: GetStoryContextResult = {
  actor: { id: storyKeeperDemoIds.rosaPersonId, displayName: 'Rosa', role: 'narrator' },
  visibility: 'narrator_review',
  personIdentities: [
    {
      personId: storyKeeperDemoIds.rosaPersonId,
      status: 'confirmed',
      displayName: 'Rosa',
    },
    {
      personId: privateCandidatePersonId,
      status: 'unresolved',
      extractedDisplayName: 'Private Raj',
      possibleMatchDisplayName: 'Raj Sharma',
    },
  ],
  facts: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      factType: 'favorite_place',
      value: 'The private garden',
      confidence: 0.9,
      status: 'pending',
      sourceCount: 1,
    },
  ],
  relationships: [],
  timelineEvents: [],
  chapters: [],
  conflicts: [],
};

const mayaContext: GetStoryContextResult = {
  actor: { id: storyKeeperDemoIds.mayaPersonId, displayName: 'Maya', role: 'relative' },
  visibility: 'approved_family',
  personIdentities: [],
  facts: [],
  relationships: [],
  timelineEvents: [],
  chapters: [],
  conflicts: [],
};

const generatingChapterContext: GetStoryContextResult = {
  ...rosaContext,
  recoverableChapterDrafts: [{ chapterDraftId, status: 'generating' }],
};

const reviewableChapterContext: GetStoryContextResult = {
  ...rosaContext,
  recoverableChapterDrafts: [{ chapterDraftId, status: 'pending_review' }],
};

const failedChapterContext: GetStoryContextResult = {
  ...rosaContext,
  recoverableChapterDrafts: [{ chapterDraftId, status: 'failed' }],
};

const approvedChapterContext: GetStoryContextResult = {
  ...rosaContext,
  chapters: [
    {
      id: chapterDraftId,
      narratorPersonId: storyKeeperDemoIds.rosaPersonId,
      title: 'Beside the Old Market',
      body: 'Rosa remembered a garden and the old market nearby.',
      status: 'approved',
      sourceCount: 2,
    },
  ],
};

const newRosaContext: GetStoryContextResult = {
  ...rosaContext,
  facts: [
    ...rosaContext.facts,
    {
      id: '20000000-0000-4000-8000-000000000003',
      subjectPersonId: storyKeeperDemoIds.rosaPersonId,
      factType: 'garden_sound',
      value: 'The garden gate squeaked in the evening breeze.',
      confidence: 0.94,
      status: 'pending',
      sourceCount: 1,
    },
  ],
};

const rosaConflicts: ListPendingConflictsResult = {
  conflicts: [
    {
      contradictionId: '30000000-0000-4000-8000-000000000001',
      contradictionType: 'fact_value',
      status: 'unresolved',
      left: {
        kind: 'fact',
        itemId: '20000000-0000-4000-8000-000000000001',
        factType: 'private_place',
        value: 'The private garden',
        status: 'pending',
        sourceAnswerIds: [answerId],
      },
      right: {
        kind: 'fact',
        itemId: '20000000-0000-4000-8000-000000000002',
        factType: 'private_place',
        value: 'The private courtyard',
        status: 'pending',
        sourceAnswerIds: [answerId],
      },
      suggestedQuestion: 'Was it the garden or the courtyard?',
    },
  ],
};

function createClient() {
  return {
    connect: vi.fn(() =>
      Promise.resolve(Array.from({ length: 15 }, (_, index) => `tool-${String(index)}`)),
    ),
    reconnect: vi.fn(() =>
      Promise.resolve(Array.from({ length: 15 }, (_, index) => `tool-${String(index)}`)),
    ),
    disconnect: vi.fn(() => Promise.resolve()),
    startInterview: vi.fn(() =>
      Promise.resolve({
        interviewId,
        narrator: {
          id: storyKeeperDemoIds.rosaPersonId,
          displayName: 'Rosa',
        },
        questionId: firstQuestionId,
        questionText: 'What do you remember about your childhood street?',
      }),
    ),
    getNextQuestion: vi
      .fn()
      .mockResolvedValueOnce({
        status: 'question',
        interviewId,
        questionId: firstQuestionId,
        questionText: 'What do you remember about your childhood street?',
      })
      .mockResolvedValue({
        status: 'question',
        interviewId,
        questionId: secondQuestionId,
        questionText: 'Who made that place feel like home?',
      }),
    saveAnswer: vi.fn<StoryKeeperClient['saveAnswer']>(() =>
      Promise.resolve({ answerId, status: 'saved' as const }),
    ),
    getStoryContext: vi.fn<StoryKeeperClient['getStoryContext']>(({ actorPersonId }) =>
      Promise.resolve(actorPersonId === rosaContext.actor.id ? rosaContext : mayaContext),
    ),
    listPendingConflicts: vi.fn<StoryKeeperClient['listPendingConflicts']>(() =>
      Promise.resolve({ conflicts: [] }),
    ),
    resolveConflict: vi.fn<StoryKeeperClient['resolveConflict']>(
      ({ contradictionId, resolutionType }) =>
        Promise.resolve({
          contradictionId,
          status: 'resolved',
          resolutionType,
          resolvedByPersonId: storyKeeperDemoIds.rosaPersonId,
          resolvedAt: '2026-01-01T00:00:00.000Z',
        }),
    ),
    approveStoryItem: vi.fn<StoryKeeperClient['approveStoryItem']>(
      ({ targetType, targetId, action }) =>
        Promise.resolve({
          targetType,
          targetId,
          action,
          status: 'updated',
          itemStatus: action === 'approve' ? 'approved' : 'rejected',
        }),
    ),
    deletePendingMemory: vi.fn<StoryKeeperClient['deletePendingMemory']>(
      ({ targetType, targetId }) =>
        Promise.resolve({ targetType, targetId, status: 'deleted', itemStatus: 'rejected' }),
    ),
    queueFamilyQuestion: vi.fn<StoryKeeperClient['queueFamilyQuestion']>(() =>
      Promise.resolve({
        queuedQuestionId: '40000000-0000-4000-8000-000000000001',
        status: 'queued',
      }),
    ),
    requestChapterDraft: vi.fn<StoryKeeperClient['requestChapterDraft']>(() =>
      Promise.resolve({
        status: 'queued',
        chapterDraftId,
        jobId: chapterJobId,
        sourceCount: 2,
      }),
    ),
    reviewChapter: vi.fn<StoryKeeperClient['reviewChapter']>(() =>
      Promise.resolve({
        chapterDraftId,
        narratorPersonId: storyKeeperDemoIds.rosaPersonId,
        chapterTopic: 'Rosa’s early years',
        title: 'Beside the Old Market',
        body: 'Rosa remembered a garden and the old market nearby.',
        status: 'pending_review',
        sources: [
          {
            type: 'fact',
            sourceId: '50000000-0000-4000-8000-000000000001',
            label: 'Favorite place: The private garden',
            summary: 'Private persisted source summary',
          },
          {
            type: 'timeline_event',
            sourceId: '50000000-0000-4000-8000-000000000002',
            label: 'Moved near the old market',
            summary: 'Private persisted event summary',
          },
        ],
      }),
    ),
    getTimeline: vi.fn<StoryKeeperClient['getTimeline']>(() => Promise.resolve({ items: [] })),
    getFamilyGraph: vi.fn<StoryKeeperClient['getFamilyGraph']>(() =>
      Promise.resolve({ nodes: [], edges: [] }),
    ),
    getApprovedChapters: vi.fn<StoryKeeperClient['getApprovedChapters']>(() =>
      Promise.resolve({ chapters: [] }),
    ),
    searchFamilyStory: vi.fn<StoryKeeperClient['searchFamilyStory']>(() =>
      Promise.resolve({ results: [] }),
    ),
  } satisfies StoryKeeperClient;
}

describe('SimulatorApp', () => {
  it('renders the shared controls and an accessible disconnected interview state', () => {
    render(<SimulatorApp createClient={createClient} />);

    expect(
      screen.getByRole('heading', { name: 'Talk with Story Keeper', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Narrator')).toHaveValue('rosa');
    expect(screen.getByLabelText('Relative')).toHaveValue('maya');
    expect(screen.getByRole('button', { name: '+3 Days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.getByLabelText('Rosa’s answer')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start / Resume interview' })).toBeDisabled();
  });

  it('connects, renders a real-client question, and saves without client-side persistence', async () => {
    const client = createClient();
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByText('What do you remember about your childhood street?', {
      selector: '.current-question',
    });

    const rawAnswer = '  The street had a large banyan tree.  ';
    fireEvent.change(screen.getByLabelText('Rosa’s answer'), { target: { value: rawAnswer } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    await screen.findByText('Who made that place feel like home?', {
      selector: '.current-question',
    });
    expect(client.saveAnswer).toHaveBeenCalledWith(expect.objectContaining({ rawText: rawAnswer }));
    expect(screen.getByLabelText('Rosa’s answer')).toHaveValue('');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.search).toBe('');
  });

  it('blocks duplicate submissions while save_answer is in flight', async () => {
    let finishSave: (() => void) | undefined;
    const client = createClient();
    client.saveAnswer = vi.fn<StoryKeeperClient['saveAnswer']>(
      () =>
        new Promise((resolve) => {
          finishSave = () => {
            resolve({ answerId, status: 'saved' });
          };
        }),
    );
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByText('What do you remember about your childhood street?', {
      selector: '.current-question',
    });
    fireEvent.change(screen.getByLabelText('Rosa’s answer'), { target: { value: 'A memory.' } });

    const submit = screen.getByRole('button', { name: 'Submit answer' });
    fireEvent.click(submit);
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    const form = submit.closest('form');
    if (form === null) throw new Error('Expected the answer form.');
    fireEvent.submit(form);
    expect(client.saveAnswer).toHaveBeenCalledTimes(1);
    finishSave?.();
    await waitFor(() => expect(screen.getByLabelText('Rosa’s answer')).toHaveValue(''));
  });

  it('distinguishes a saved answer from later structured-memory availability', async () => {
    let answerSaved = false;
    let checksAfterSave = 0;
    const client = createClient();
    client.saveAnswer = vi.fn<StoryKeeperClient['saveAnswer']>(() => {
      answerSaved = true;
      return Promise.resolve({ answerId, status: 'saved' });
    });
    client.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(({ actorPersonId }) => {
      if (actorPersonId === mayaContext.actor.id) return Promise.resolve(mayaContext);
      if (!answerSaved) return Promise.resolve(rosaContext);
      checksAfterSave += 1;
      return Promise.resolve(checksAfterSave < 2 ? rosaContext : newRosaContext);
    });
    render(
      <SimulatorApp
        createClient={() => client}
        processingTiming={{ pollIntervalMs: 1, maxAttempts: 3 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByText('What do you remember about your childhood street?', {
      selector: '.current-question',
    });
    fireEvent.change(screen.getByLabelText('Rosa’s answer'), {
      target: { value: 'The gate squeaked in the breeze.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(await screen.findByText('Your answer was saved.')).toBeInTheDocument();
    expect(screen.getByText('Story Keeper is organizing the memory.')).toBeInTheDocument();
    expect(screen.queryByText('New structured memory is ready.')).not.toBeInTheDocument();

    expect(await screen.findByText('New structured memory is ready.')).toBeInTheDocument();
    const productRegion = screen.getByRole('region', { name: 'Review story memories' });
    expect(
      within(productRegion).getByText('The garden gate squeaked in the evening breeze.'),
    ).toBeInTheDocument();
    expect(client.saveAnswer).toHaveBeenCalledTimes(1);
  });

  it('keeps the answer saved when bounded processing checks find no new memory', async () => {
    const client = createClient();
    render(
      <SimulatorApp
        createClient={() => client}
        processingTiming={{ pollIntervalMs: 1, maxAttempts: 2 }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByText('What do you remember about your childhood street?', {
      selector: '.current-question',
    });
    fireEvent.change(screen.getByLabelText('Rosa’s answer'), {
      target: { value: 'A memory that will be organized later.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(await screen.findByText('Your answer is safely saved.')).toBeInTheDocument();
    expect(
      screen.getByText('Story Keeper is still organizing it in the background.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(client.saveAnswer).toHaveBeenCalledTimes(1);
  });

  it('cancels a Rosa processing refresh before a late response can reach Maya', async () => {
    let answerSaved = false;
    let resolveLateRosa: ((context: GetStoryContextResult) => void) | undefined;
    const client = createClient();
    client.saveAnswer = vi.fn<StoryKeeperClient['saveAnswer']>(() => {
      answerSaved = true;
      return Promise.resolve({ answerId, status: 'saved' });
    });
    client.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(({ actorPersonId }) => {
      if (actorPersonId === mayaContext.actor.id) return Promise.resolve(mayaContext);
      if (!answerSaved) return Promise.resolve(rosaContext);
      return new Promise((resolve) => {
        resolveLateRosa = resolve;
      });
    });
    render(
      <SimulatorApp
        createClient={() => client}
        processingTiming={{ pollIntervalMs: 1, maxAttempts: 2 }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByText('What do you remember about your childhood street?', {
      selector: '.current-question',
    });
    fireEvent.change(screen.getByLabelText('Rosa’s answer'), {
      target: { value: 'A private garden memory.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    await screen.findByText('Your answer was saved.');
    await waitFor(() => {
      expect(resolveLateRosa).toBeTypeOf('function');
    });

    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    expect(screen.queryByText('Your answer was saved.')).not.toBeInTheDocument();
    expect(screen.queryByText(/organizing the memory/i)).not.toBeInTheDocument();
    expect(screen.getByText('Viewing Maya’s approved family memory.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Review story memories' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Approved family memories' })).toBeInTheDocument();
    expect(screen.queryByText('Private Raj')).not.toBeInTheDocument();
    expect(screen.queryByText('Raj Sharma')).not.toBeInTheDocument();
    expect(screen.queryByText(/Supported by .* interview source/)).not.toBeInTheDocument();
    resolveLateRosa?.(newRosaContext);

    expect(
      await screen.findByText('No structured story items are visible to Maya.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/garden gate squeaked/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Private Raj|Raj Sharma/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Supported by .* interview source/)).not.toBeInTheDocument();
      expect(screen.queryByText('New structured memory is ready.')).not.toBeInTheDocument();
    });
  });

  it('shows a controlled connection error with no mock interview fallback', async () => {
    const client = createClient();
    client.connect = vi.fn(() => Promise.reject(new Error('private transport detail')));
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Story Keeper is unavailable. Check the server and try again.',
    );
    expect(
      screen.queryByText('What do you remember about your childhood street?'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start / Resume interview' })).toBeDisabled();
  });

  it('ignores a connection that completes after unmount', async () => {
    let finishConnect: ((toolNames: string[]) => void) | undefined;
    const getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>();
    const client = createClient();
    client.connect = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          finishConnect = resolve;
        }),
    );
    client.getStoryContext = getStoryContext;

    const { unmount } = render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    unmount();
    finishConnect?.([...STORY_KEEPER_TOOL_NAMES]);

    await waitFor(() => {
      expect(getStoryContext).not.toHaveBeenCalled();
    });
  });

  it('clears previously loaded memory when reconnect fails', async () => {
    const client = createClient();
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'LI' && element.textContent.includes('The private garden'),
      ),
    ).toBeInTheDocument();

    client.reconnect = vi.fn(() => Promise.reject(new Error('server stopped')));
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/The private garden/)).not.toBeInTheDocument();
  });

  it('reconnects and restores the active interview through start_interview', async () => {
    const client = createClient();
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByText('What do you remember about your childhood street?', {
      selector: '.current-question',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await screen.findByText('Reconnected. Rosa’s interview was restored from Story Keeper.');
    expect(client.reconnect).toHaveBeenCalledTimes(1);
    expect(client.startInterview).toHaveBeenCalledTimes(2);
  });

  it('retains the Phase 0 time-jump control', () => {
    render(<SimulatorApp createClient={createClient} />);
    fireEvent.click(screen.getByRole('button', { name: '+3 Days' }));
    expect(screen.getByText('Demo day: +3 days')).toBeInTheDocument();
  });

  it('approves through the client and shows only canonically refreshed state', async () => {
    let approved = false;
    const pendingFact = rosaContext.facts[0];
    if (pendingFact === undefined) throw new Error('Expected the Rosa fixture to include a fact.');
    const approvedFact = { ...pendingFact, status: 'approved' as const };
    const approvedRosaContext: GetStoryContextResult = { ...rosaContext, facts: [approvedFact] };
    const approvedMayaContext: GetStoryContextResult = {
      ...mayaContext,
      facts: [approvedFact],
    };
    const client = createClient();
    client.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(({ actorPersonId }) =>
      Promise.resolve(
        actorPersonId === storyKeeperDemoIds.mayaPersonId
          ? approvedMayaContext
          : approved
            ? approvedRosaContext
            : rosaContext,
      ),
    );
    client.approveStoryItem = vi.fn<StoryKeeperClient['approveStoryItem']>((input) => {
      approved = true;
      return Promise.resolve({
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        status: 'updated',
        itemStatus: 'approved',
      });
    });
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    const review = screen.getByRole('region', { name: 'Review story memories' });
    fireEvent.click(within(review).getByRole('button', { name: 'Approve Favorite place' }));

    expect(await within(review).findByText('Approved memory')).toBeVisible();
    expect(within(review).getByRole('status')).toHaveTextContent(
      'Memory approved. Story Keeper refreshed the latest story state.',
    );
    expect(client.approveStoryItem).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'fact',
      targetId: approvedFact.id,
      action: 'approve',
    });
    expect(
      within(review).getByRole('button', { name: 'Revoke approval for Favorite place' }),
    ).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    const familyView = await screen.findByRole('region', { name: 'Approved family memories' });
    expect(within(familyView).getByText('The private garden')).toBeVisible();
    expect(
      within(familyView).queryByRole('button', { name: /approve|reject|revoke|remove/i }),
    ).toBeNull();
    expect(client.getStoryContext).toHaveBeenLastCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.mayaPersonId,
    });
  });

  it('refreshes canonical state after a stale conflicting memory transition', async () => {
    let externallyApproved = false;
    const approvedContext: GetStoryContextResult = {
      ...rosaContext,
      facts: rosaContext.facts.map((fact) => ({ ...fact, status: 'approved' as const })),
    };
    const client = createClient();
    client.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(() =>
      Promise.resolve(externallyApproved ? approvedContext : rosaContext),
    );
    client.approveStoryItem = vi.fn<StoryKeeperClient['approveStoryItem']>(() => {
      externallyApproved = true;
      return Promise.reject(
        new StoryKeeperClientError('story_item_state', 'This memory changed since it was loaded.'),
      );
    });
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Reject Favorite place' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection for Favorite place' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This memory changed since you opened it. We’ve refreshed the latest story state.',
    );
    expect(screen.getByText('Approved memory')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Revoke approval for Favorite place' }),
    ).toBeEnabled();
  });

  it('does not let a late Rosa approval refresh or notice reach Maya', async () => {
    let resolveLateRosaRefresh: ((context: GetStoryContextResult) => void) | undefined;
    let resolveApproval:
      ((result: Awaited<ReturnType<StoryKeeperClient['approveStoryItem']>>) => void) | undefined;
    let approvalStarted = false;
    const client = createClient();
    client.approveStoryItem = vi.fn<StoryKeeperClient['approveStoryItem']>(
      () =>
        new Promise((resolve) => {
          resolveApproval = resolve;
        }),
    );
    client.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(({ actorPersonId }) => {
      if (actorPersonId === storyKeeperDemoIds.mayaPersonId) return Promise.resolve(mayaContext);
      if (!approvalStarted) return Promise.resolve(rosaContext);
      return new Promise((resolve) => {
        resolveLateRosaRefresh = resolve;
      });
    });
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Approve Favorite place' }));
    await screen.findByText('Approving memory…');
    approvalStarted = true;
    const pendingFact = rosaContext.facts[0];
    if (pendingFact === undefined) throw new Error('Expected the Rosa fixture to include a fact.');
    resolveApproval?.({
      targetType: 'fact',
      targetId: pendingFact.id,
      action: 'approve',
      status: 'updated',
      itemStatus: 'approved',
    });
    await waitFor(() => {
      expect(resolveLateRosaRefresh).toBeTypeOf('function');
    });

    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    const familyView = await screen.findByRole('region', { name: 'Approved family memories' });
    expect(
      within(familyView).getByText('No approved family memories are available yet.'),
    ).toBeVisible();
    expect(screen.queryByText(/Approving memory|Memory approved|could not change/i)).toBeNull();

    resolveLateRosaRefresh?.({
      ...rosaContext,
      facts: rosaContext.facts.map((fact) => ({ ...fact, status: 'approved' as const })),
    });
    await waitFor(() => {
      expect(
        within(familyView).getByText('No approved family memories are available yet.'),
      ).toBeVisible();
      expect(screen.queryByText(/The private garden|Memory approved|could not change/i)).toBeNull();
    });
    expect(client.getStoryContext).toHaveBeenLastCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.mayaPersonId,
    });
  });

  it('confirms a resolution and refreshes conflicts from canonical backend state', async () => {
    const client = createClient();
    client.listPendingConflicts = vi
      .fn<StoryKeeperClient['listPendingConflicts']>()
      .mockResolvedValueOnce(rosaConflicts)
      .mockResolvedValue({ conflicts: [] });
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByRole('heading', { name: 'Possible conflict 1' });

    fireEvent.click(screen.getByRole('button', { name: 'Keep the first memory' }));
    expect(client.resolveConflict).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Keep the first memory' }));

    expect(
      await screen.findByText('No memories need conflict review right now.'),
    ).toBeInTheDocument();
    const conflictRegion = screen.getByRole('region', { name: 'Memories that need review' });
    expect(within(conflictRegion).getByRole('status')).toHaveTextContent(
      'Conflict resolved. Story Keeper refreshed the latest story state.',
    );
    expect(client.resolveConflict).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      interviewId,
      contradictionId: rosaConflicts.conflicts[0]?.contradictionId,
      resolutionType: 'keep_left',
    });
    expect(client.listPendingConflicts).toHaveBeenCalledTimes(2);
    expect(screen.getByText('The private garden', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Approved', { exact: true })).not.toBeInTheDocument();
  });

  it('treats an identical already-resolved replay as a stable canonical result', async () => {
    const client = createClient();
    client.listPendingConflicts = vi
      .fn<StoryKeeperClient['listPendingConflicts']>()
      .mockResolvedValueOnce(rosaConflicts)
      .mockResolvedValue({ conflicts: [] });
    client.resolveConflict = vi.fn<StoryKeeperClient['resolveConflict']>(() =>
      Promise.resolve({
        contradictionId: rosaConflicts.conflicts[0]?.contradictionId ?? answerId,
        status: 'already_resolved',
        resolutionType: 'keep_left',
        resolvedByPersonId: storyKeeperDemoIds.rosaPersonId,
        resolvedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByRole('heading', { name: 'Possible conflict 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep the first memory' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Keep the first memory' }));

    expect(
      await screen.findByText(
        'That choice was already saved. Story Keeper refreshed the latest story state.',
      ),
    ).toHaveAttribute('role', 'status');
    expect(screen.getByText('No memories need conflict review right now.')).toBeInTheDocument();
    expect(client.listPendingConflicts).toHaveBeenCalledTimes(2);
  });

  it('does not claim canonical refresh succeeded when the post-resolution read fails', async () => {
    const client = createClient();
    client.listPendingConflicts = vi
      .fn<StoryKeeperClient['listPendingConflicts']>()
      .mockResolvedValueOnce(rosaConflicts)
      .mockRejectedValueOnce(new StoryKeeperClientError('unavailable', 'Connection interrupted.'));
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByRole('heading', { name: 'Possible conflict 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep the first memory' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Keep the first memory' }));

    expect(
      await screen.findByText(
        'Your choice was saved, but the latest story state could not be refreshed. Reconnect before continuing.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(
      screen.queryByText('Conflict resolved. Story Keeper refreshed the latest story state.'),
    ).not.toBeInTheDocument();
  });

  it('refreshes and explains a stale conflicting resolution without claiming success', async () => {
    const client = createClient();
    client.listPendingConflicts = vi
      .fn<StoryKeeperClient['listPendingConflicts']>()
      .mockResolvedValueOnce(rosaConflicts)
      .mockResolvedValue({ conflicts: [] });
    client.resolveConflict = vi.fn<StoryKeeperClient['resolveConflict']>(() =>
      Promise.reject(
        new StoryKeeperClientError('conflict_state', 'This conflict changed since it was loaded.'),
      ),
    );
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByRole('heading', { name: 'Possible conflict 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep the second memory' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Keep the second memory' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This conflict changed since you opened it. We’ve refreshed the latest story state.',
    );
    expect(screen.getByText('No memories need conflict review right now.')).toBeInTheDocument();
    expect(screen.queryByText('Conflict resolved.')).not.toBeInTheDocument();
    expect(client.listPendingConflicts).toHaveBeenCalledTimes(2);
  });

  it('ignores a late Rosa resolution response after switching to Maya', async () => {
    let resolveLateResolution:
      ((result: Awaited<ReturnType<StoryKeeperClient['resolveConflict']>>) => void) | undefined;
    const client = createClient();
    client.listPendingConflicts = vi.fn<StoryKeeperClient['listPendingConflicts']>(() =>
      Promise.resolve(rosaConflicts),
    );
    client.resolveConflict = vi.fn<StoryKeeperClient['resolveConflict']>(
      () =>
        new Promise((resolve) => {
          resolveLateResolution = resolve;
        }),
    );
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await screen.findByRole('heading', { name: 'Possible conflict 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep the first memory' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Keep the first memory' }));
    await screen.findByText(/Saving “Keep the first memory”/);

    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    expect(
      screen.queryByRole('region', { name: 'Memories that need review' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/1962|1964|Saving “Keep the first memory”/)).not.toBeInTheDocument();
    resolveLateResolution?.({
      contradictionId: rosaConflicts.conflicts[0]?.contradictionId ?? answerId,
      status: 'resolved',
      resolutionType: 'keep_left',
      resolvedByPersonId: storyKeeperDemoIds.rosaPersonId,
      resolvedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(
      await screen.findByText('No structured story items are visible to Maya.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Conflict resolved|This conflict changed/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/The private garden|The private courtyard/),
      ).not.toBeInTheDocument();
    });
    expect(client.getStoryContext).toHaveBeenLastCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.mayaPersonId,
    });
  });

  it('supersedes late Rosa context and conflict responses after switching to Maya', async () => {
    let resolveLateRosa: ((context: GetStoryContextResult) => void) | undefined;
    let resolveLateConflicts: ((conflicts: ListPendingConflictsResult) => void) | undefined;
    let rosaContextCalls = 0;
    const client = createClient();
    client.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(({ actorPersonId }) => {
      if (actorPersonId !== rosaContext.actor.id) return Promise.resolve(mayaContext);
      rosaContextCalls += 1;
      if (rosaContextCalls === 1) return Promise.resolve(rosaContext);
      return new Promise((resolve) => {
        resolveLateRosa = resolve;
      });
    });
    client.listPendingConflicts = vi.fn<StoryKeeperClient['listPendingConflicts']>(
      () =>
        new Promise((resolve) => {
          resolveLateConflicts = resolve;
        }),
    );
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'LI' && element.textContent.includes('The private garden'),
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await waitFor(() => {
      expect(client.listPendingConflicts).toHaveBeenCalledTimes(1);
    });
    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });

    expect(screen.queryByText(/The private garden/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Private Raj|Raj Sharma/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Supported by .* interview source/)).not.toBeInTheDocument();
    expect(
      await screen.findByText('No structured story items are visible to Maya.'),
    ).toBeInTheDocument();
    expect(client.getStoryContext).toHaveBeenLastCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: mayaContext.actor.id,
    });

    resolveLateRosa?.(rosaContext);
    resolveLateConflicts?.(rosaConflicts);
    await waitFor(() => {
      expect(
        screen.getByText('No structured story items are visible to Maya.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/The private garden|The private courtyard|Private Raj|Raj Sharma/),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('Conflict review is available only in narrator mode.'),
      ).toBeInTheDocument();
    });
    expect(client.listPendingConflicts).toHaveBeenCalledTimes(1);
  });

  it('lets Maya queue a trimmed family question without exposing queue internals', async () => {
    const client = createClient();
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText(
      (_, element) =>
        element?.classList.contains('visibility-label') === true &&
        element.textContent.includes('Viewing as Rosa'),
    );
    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });

    const questionBox = await screen.findByLabelText('What would you like Rosa to talk about?');
    expect(screen.getByRole('heading', { name: 'Ask Rosa a question' })).toBeInTheDocument();
    expect(
      screen.getByText('Your question will be added to Rosa’s future interview prompts.'),
    ).toBeInTheDocument();
    fireEvent.change(questionBox, { target: { value: '  What was your first job?  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));

    expect(await screen.findByText('Question added for Rosa.')).toBeInTheDocument();
    expect(client.queueFamilyQuestion).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      fromPersonId: storyKeeperDemoIds.mayaPersonId,
      toPersonId: storyKeeperDemoIds.rosaPersonId,
      questionText: 'What was your first job?',
    });
    expect(questionBox).toHaveValue('');
    expect(screen.queryByText('40000000-0000-4000-8000-000000000001')).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.search).toBe('');

    fireEvent.change(questionBox, { target: { value: 'x'.repeat(501) } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(
      await screen.findByText('Enter a question between 1 and 500 characters.'),
    ).toBeInTheDocument();
    expect(questionBox).toHaveAttribute('aria-invalid', 'true');
    expect(questionBox).toHaveFocus();
    expect(client.queueFamilyQuestion).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate question clicks and clears Maya state across an actor-switch race', async () => {
    let finishQueue: ((result: { queuedQuestionId: string; status: 'queued' }) => void) | undefined;
    const client = createClient();
    client.queueFamilyQuestion = vi.fn<StoryKeeperClient['queueFamilyQuestion']>(
      () =>
        new Promise((resolve) => {
          finishQueue = resolve;
        }),
    );
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText(
      (_, element) =>
        element?.classList.contains('visibility-label') === true &&
        element.textContent.includes('Viewing as Rosa'),
    );
    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    const questionBox = await screen.findByLabelText('What would you like Rosa to talk about?');
    fireEvent.change(questionBox, { target: { value: 'A private draft from Maya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sending…' }));
    expect(client.queueFamilyQuestion).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'rosa' } });
    expect(screen.queryByText('A private draft from Maya')).not.toBeInTheDocument();
    finishQueue?.({
      queuedQuestionId: '40000000-0000-4000-8000-000000000001',
      status: 'queued',
    });
    await waitFor(() => {
      expect(screen.queryByText('Question added for Rosa.')).not.toBeInTheDocument();
      expect(screen.queryByText('A private draft from Maya')).not.toBeInTheDocument();
    });
  });

  it('ignores a late Rosa question after switching to Maya', async () => {
    let finishQuestion: ((result: GetNextQuestionResult) => void) | undefined;
    const client = createClient();
    client.getNextQuestion = vi.fn<StoryKeeperClient['getNextQuestion']>(
      () =>
        new Promise((resolve) => {
          finishQuestion = resolve;
        }),
    );
    render(<SimulatorApp createClient={() => client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText(
      (_, element) =>
        element?.classList.contains('visibility-label') === true &&
        element.textContent.includes('Viewing as Rosa'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume interview' }));
    await waitFor(() => {
      expect(client.getNextQuestion).toHaveBeenCalledTimes(1);
    });
    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    await screen.findByRole('heading', { name: 'Ask Rosa a question' });

    finishQuestion?.({
      status: 'question',
      interviewId,
      questionId: secondQuestionId,
      questionText: 'Rosa private queued interview question',
    });
    await waitFor(() => {
      expect(screen.queryByText('Rosa private queued interview question')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Ask Rosa a question' })).toBeInTheDocument();
    });
  });

  it('requests a chapter, recovers its canonical draft, reviews it, and approves it', async () => {
    const client = createClient();
    client.getStoryContext = vi
      .fn<StoryKeeperClient['getStoryContext']>()
      .mockResolvedValueOnce(rosaContext)
      .mockResolvedValueOnce(generatingChapterContext)
      .mockResolvedValueOnce(reviewableChapterContext)
      .mockResolvedValueOnce(approvedChapterContext);
    render(
      <SimulatorApp
        createClient={() => client}
        chapterPollingTiming={{ pollIntervalMs: 1, maxAttempts: 3 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    const topic = screen.getByLabelText('What should this chapter focus on?');
    fireEvent.change(topic, { target: { value: '  Rosa’s early years  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate chapter' }));

    expect(client.requestChapterDraft).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      narratorPersonId: storyKeeperDemoIds.rosaPersonId,
      chapterTopic: 'Rosa’s early years',
    });
    expect(
      await screen.findByText('Chapter request accepted. Story Keeper is drafting it for review.'),
    ).toHaveAttribute('role', 'status');
    expect(await screen.findByRole('heading', { name: 'Beside the Old Market' })).toBeVisible();
    expect(client.reviewChapter).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      chapterDraftId,
    });
    expect(screen.queryByText('Private persisted source summary')).not.toBeInTheDocument();
    expect(screen.queryByText('50000000-0000-4000-8000-000000000001')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve chapter' }));
    expect(
      await screen.findByText('Chapter approved. Story Keeper refreshed the latest family story.'),
    ).toHaveAttribute('role', 'status');
    expect(client.approveStoryItem).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'chapter',
      targetId: chapterDraftId,
      action: 'approve',
    });
    const familyStory = screen.getByRole('region', { name: 'Review story memories' });
    expect(within(familyStory).getByText('Approved chapter')).toBeVisible();
    expect(within(familyStory).getByText('Beside the Old Market')).toBeVisible();
  });

  it('validates chapter topics without truncating or submitting invalid text', async () => {
    const client = createClient();
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    const topic = screen.getByLabelText('What should this chapter focus on?');
    const tooLong = 'x'.repeat(201);
    fireEvent.change(topic, { target: { value: tooLong } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate chapter' }));

    expect(topic).toHaveValue(tooLong);
    await waitFor(() => {
      expect(topic).toHaveFocus();
    });
    expect(topic).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a chapter topic between 1 and 200 characters.')).toHaveAttribute(
      'role',
      'alert',
    );
    expect(client.requestChapterDraft).not.toHaveBeenCalled();
  });

  it('distinguishes accepted chapter mutations from a later canonical refresh failure', async () => {
    const requestClient = createClient();
    requestClient.getStoryContext = vi
      .fn<StoryKeeperClient['getStoryContext']>()
      .mockResolvedValueOnce(rosaContext)
      .mockRejectedValueOnce(new StoryKeeperClientError('unavailable', 'Connection interrupted.'));
    const { unmount } = render(<SimulatorApp createClient={() => requestClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.change(screen.getByLabelText('What should this chapter focus on?'), {
      target: { value: 'Rosa’s early years' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate chapter' }));
    expect(
      await screen.findByText(
        'The chapter request was accepted, but its latest status could not be loaded. Reconnect to continue.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(screen.queryByText(/No chapter was created/)).not.toBeInTheDocument();
    unmount();

    const approvalClient = createClient();
    approvalClient.getStoryContext = vi
      .fn<StoryKeeperClient['getStoryContext']>()
      .mockResolvedValueOnce(reviewableChapterContext)
      .mockRejectedValueOnce(new StoryKeeperClientError('unavailable', 'Connection interrupted.'));
    render(<SimulatorApp createClient={() => approvalClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('heading', { name: 'Beside the Old Market' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve chapter' }));
    expect(
      await screen.findByText(
        'Your chapter choice was saved, but the latest story state could not be loaded. Reconnect before continuing.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('button', { name: 'Approve chapter' })).not.toBeInTheDocument();
  });

  it('recovers a pending review after a fresh connection and handles failed drafts safely', async () => {
    const reviewClient = createClient();
    reviewClient.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(() =>
      Promise.resolve(reviewableChapterContext),
    );
    const { unmount } = render(<SimulatorApp createClient={() => reviewClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('heading', { name: 'Beside the Old Market' })).toBeVisible();
    expect(reviewClient.reviewChapter).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      chapterDraftId,
    });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.search).toBe('');
    unmount();

    const failedClient = createClient();
    failedClient.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(() =>
      Promise.resolve(failedChapterContext),
    );
    render(<SimulatorApp createClient={() => failedClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(
      await screen.findByRole('heading', { name: 'This chapter couldn’t be generated' }),
    ).toBeVisible();
    expect(screen.getByText(/Private provider details remain hidden/)).toBeVisible();
    expect(screen.queryByText(/Chapter source references must be unique/)).not.toBeInTheDocument();
    expect(screen.queryByText(/INVALID_CHAPTER_OUTPUT/)).not.toBeInTheDocument();
    expect(failedClient.reviewChapter).not.toHaveBeenCalled();
  });

  it('requires confirmation before rejecting a chapter and refreshes canonical state', async () => {
    const client = createClient();
    client.getStoryContext = vi
      .fn<StoryKeeperClient['getStoryContext']>()
      .mockResolvedValueOnce(reviewableChapterContext)
      .mockResolvedValueOnce(rosaContext);
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('heading', { name: 'Beside the Old Market' });

    fireEvent.click(screen.getByRole('button', { name: 'Reject chapter' }));
    expect(client.approveStoryItem).not.toHaveBeenCalled();
    const confirmation = screen.getByRole('group', { name: 'Reject this chapter?' });
    expect(confirmation).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm chapter rejection' }));

    expect(
      await screen.findByText(
        'Chapter rejected. It will not appear in family-visible story views.',
      ),
    ).toHaveAttribute('role', 'status');
    expect(client.approveStoryItem).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'chapter',
      targetId: chapterDraftId,
      action: 'reject',
    });
    expect(
      screen.queryByRole('heading', { name: 'Beside the Old Market' }),
    ).not.toBeInTheDocument();
  });

  it('does not leak a late chapter request response across an actor switch', async () => {
    let finishRequest:
      ((result: Awaited<ReturnType<StoryKeeperClient['requestChapterDraft']>>) => void) | undefined;
    const client = createClient();
    client.requestChapterDraft = vi.fn<StoryKeeperClient['requestChapterDraft']>(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.change(screen.getByLabelText('What should this chapter focus on?'), {
      target: { value: 'Rosa private chapter topic' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate chapter' }));
    await screen.findByText('Sending chapter request…');
    expect(screen.queryByRole('button', { name: 'Generate chapter' })).not.toBeInTheDocument();
    expect(client.requestChapterDraft).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    await screen.findByRole('heading', { name: 'Ask Rosa a question' });
    finishRequest?.({ status: 'queued', chapterDraftId, jobId: chapterJobId, sourceCount: 2 });
    await waitFor(() => {
      expect(screen.queryByText(/Rosa private chapter topic/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Chapter request accepted|Sending chapter request/)).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Create a chapter' })).not.toBeInTheDocument();
    });
  });

  it('ignores a late post-request chapter context refresh after switching to Maya', async () => {
    let finishRosaRefresh: ((context: GetStoryContextResult) => void) | undefined;
    let rosaContextReads = 0;
    const client = createClient();
    client.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(({ actorPersonId }) => {
      if (actorPersonId === storyKeeperDemoIds.mayaPersonId) return Promise.resolve(mayaContext);
      rosaContextReads += 1;
      if (rosaContextReads === 1) return Promise.resolve(rosaContext);
      return new Promise((resolve) => {
        finishRosaRefresh = resolve;
      });
    });
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.change(screen.getByLabelText('What should this chapter focus on?'), {
      target: { value: 'Rosa private canonical refresh topic' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate chapter' }));
    await waitFor(() => {
      expect(finishRosaRefresh).toBeTypeOf('function');
    });

    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    await screen.findByRole('heading', { name: 'Ask Rosa a question' });
    finishRosaRefresh?.(reviewableChapterContext);

    await waitFor(() => {
      expect(screen.getByText('Viewing Maya’s approved family memory.')).toBeVisible();
      expect(screen.queryByRole('heading', { name: 'Create a chapter' })).not.toBeInTheDocument();
      expect(screen.queryByText('Rosa private canonical refresh topic')).not.toBeInTheDocument();
      expect(screen.queryByText(/Chapter request accepted/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Drafting chapter|Preparing your review/)).not.toBeInTheDocument();
      expect(screen.queryByText('Beside the Old Market')).not.toBeInTheDocument();
      expect(screen.queryByText(chapterDraftId)).not.toBeInTheDocument();
      expect(client.reviewChapter).not.toHaveBeenCalled();
    });
  });

  it('ignores late review and approval refresh data after switching to Maya', async () => {
    let finishReview:
      ((result: Awaited<ReturnType<StoryKeeperClient['reviewChapter']>>) => void) | undefined;
    const reviewClient = createClient();
    reviewClient.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(
      ({ actorPersonId }) =>
        Promise.resolve(
          actorPersonId === storyKeeperDemoIds.rosaPersonId
            ? reviewableChapterContext
            : mayaContext,
        ),
    );
    reviewClient.reviewChapter = vi.fn<StoryKeeperClient['reviewChapter']>(
      () =>
        new Promise((resolve) => {
          finishReview = resolve;
        }),
    );
    const { unmount } = render(<SimulatorApp createClient={() => reviewClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Preparing your review…');
    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    await screen.findByRole('heading', { name: 'Ask Rosa a question' });
    finishReview?.(
      await createClient().reviewChapter({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
        chapterDraftId,
      }),
    );
    await waitFor(() => {
      expect(screen.queryByText('Beside the Old Market')).not.toBeInTheDocument();
      expect(screen.queryByText('Preparing your review…')).not.toBeInTheDocument();
    });
    unmount();

    let finishApproval:
      ((result: Awaited<ReturnType<StoryKeeperClient['approveStoryItem']>>) => void) | undefined;
    let finishRefresh: ((context: GetStoryContextResult) => void) | undefined;
    let approvalResolved = false;
    const approvalClient = createClient();
    approvalClient.getStoryContext = vi.fn<StoryKeeperClient['getStoryContext']>(
      ({ actorPersonId }) => {
        if (actorPersonId === storyKeeperDemoIds.mayaPersonId) return Promise.resolve(mayaContext);
        if (!approvalResolved) return Promise.resolve(reviewableChapterContext);
        return new Promise((resolve) => {
          finishRefresh = resolve;
        });
      },
    );
    approvalClient.approveStoryItem = vi.fn<StoryKeeperClient['approveStoryItem']>(
      () =>
        new Promise((resolve) => {
          finishApproval = resolve;
        }),
    );
    render(<SimulatorApp createClient={() => approvalClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('heading', { name: 'Beside the Old Market' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve chapter' }));
    approvalResolved = true;
    finishApproval?.({
      targetType: 'chapter',
      targetId: chapterDraftId,
      action: 'approve',
      status: 'updated',
      itemStatus: 'approved',
    });
    await waitFor(() => {
      expect(finishRefresh).toBeTypeOf('function');
    });
    fireEvent.change(screen.getByLabelText('Inspect memory as'), { target: { value: 'maya' } });
    await screen.findByRole('heading', { name: 'Ask Rosa a question' });
    finishRefresh?.(approvedChapterContext);
    await waitFor(() => {
      expect(screen.queryByText('Chapter approved.')).not.toBeInTheDocument();
      expect(screen.queryByText('Beside the Old Market')).not.toBeInTheDocument();
      expect(screen.queryByText(/Approving/)).not.toBeInTheDocument();
    });
  });

  it('submits canonical search input, preserves returned order, and distinguishes invalid from empty', async () => {
    const client = createClient();
    client.searchFamilyStory.mockResolvedValue({
      results: [
        {
          sourceType: 'timeline_event',
          sourceId: '60000000-0000-4000-8000-000000000001',
          title: 'Zulu timeline',
          snippet: 'Élodie remembered the garden.',
          personId: storyKeeperDemoIds.rosaPersonId,
          personDisplayName: 'Rosa',
          date: { earliestYear: 1962, latestYear: 1964, precision: 'range' },
          rank: -2,
        },
        {
          sourceType: 'fact',
          sourceId: '60000000-0000-4000-8000-000000000002',
          title: 'Alpha memory',
          snippet: 'A second result.',
          personId: null,
          personDisplayName: null,
          date: null,
          rank: -1,
        },
      ],
    });
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));

    const input = screen.getByLabelText('Search family stories');
    fireEvent.change(input, { target: { value: '  Élodie OR NEAR  ' } });
    fireEvent.submit(screen.getByRole('search'));
    await screen.findByText('2 results found.');
    expect(client.searchFamilyStory).toHaveBeenCalledWith({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      query: 'Élodie OR NEAR',
      limit: 10,
    });
    expect(
      screen.getAllByRole('listitem').map((item) => within(item).getByRole('heading').textContent),
    ).toEqual(['Zulu timeline', 'Alpha memory']);

    fireEvent.change(input, { target: { value: 'no matches' } });
    client.searchFamilyStory.mockResolvedValueOnce({ results: [] });
    fireEvent.submit(screen.getByRole('search'));
    await screen.findByText('No matching family stories found.');

    const callsBeforeInvalid = client.searchFamilyStory.mock.calls.length;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByRole('alert')).toHaveTextContent('at least one letter or number');
    fireEvent.change(input, { target: { value: 'x'.repeat(201) } });
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByRole('alert')).toHaveTextContent('no more than 200 characters');
    expect(client.searchFamilyStory).toHaveBeenCalledTimes(callsBeforeInvalid);
  });

  it('maps punctuation-only and unknown search failures without exposing backend details', async () => {
    const client = createClient();
    client.searchFamilyStory
      .mockRejectedValueOnce(
        new StoryKeeperClientError(
          'validation',
          'Enter a search with at least one letter or number.',
        ),
      )
      .mockRejectedValueOnce(new Error('SQLITE_ERROR: private/path/story.sqlite'));
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    const input = screen.getByLabelText('Search family stories');

    fireEvent.change(input, { target: { value: '" * ( )' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(await screen.findByRole('alert')).toHaveTextContent('at least one letter or number');
    expect(screen.queryByText(/SQLITE_ERROR|FTS5|private\/path/i)).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'garden' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Family story search could not be completed. Try again.',
    );
    expect(screen.queryByText(/SQLITE_ERROR|private\/path/i)).not.toBeInTheDocument();
  });

  it('clears Rosa search state and ignores delayed success or failure after switching to Maya', async () => {
    let finishSearch:
      ((result: Awaited<ReturnType<StoryKeeperClient['searchFamilyStory']>>) => void) | undefined;
    const successClient = createClient();
    successClient.searchFamilyStory = vi.fn<StoryKeeperClient['searchFamilyStory']>(
      () =>
        new Promise((resolve) => {
          finishSearch = resolve;
        }),
    );
    const { unmount } = render(<SimulatorApp createClient={() => successClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    fireEvent.change(screen.getByLabelText('Search family stories'), {
      target: { value: 'Rosa private query' },
    });
    fireEvent.submit(screen.getByRole('search'));
    await screen.findByText('Searching approved family stories…');
    fireEvent.change(screen.getByLabelText('Search as'), { target: { value: 'maya' } });
    await waitFor(() => {
      expect(screen.getByLabelText('Search family stories')).toHaveValue('');
      expect(screen.getByText('Enter a search to begin.')).toBeVisible();
    });
    finishSearch?.({
      results: [
        {
          sourceType: 'fact',
          sourceId: '60000000-0000-4000-8000-000000000003',
          title: 'Rosa private result',
          snippet: 'Rosa private snippet',
          personId: null,
          personDisplayName: null,
          date: null,
          rank: -1,
        },
      ],
    });
    await waitFor(() => {
      expect(screen.queryByText('Rosa private result')).not.toBeInTheDocument();
      expect(screen.queryByText('1 result found.')).not.toBeInTheDocument();
    });
    unmount();

    let failSearch: ((reason?: unknown) => void) | undefined;
    const failureClient = createClient();
    failureClient.searchFamilyStory = vi.fn<StoryKeeperClient['searchFamilyStory']>(
      () =>
        new Promise((_resolve, reject) => {
          failSearch = reject;
        }),
    );
    render(<SimulatorApp createClient={() => failureClient} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    fireEvent.change(screen.getByLabelText('Search family stories'), {
      target: { value: 'Rosa failing query' },
    });
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.change(screen.getByLabelText('Search as'), { target: { value: 'maya' } });
    failSearch?.(new Error('late private failure'));
    await waitFor(() => {
      expect(screen.getByLabelText('Search family stories')).toHaveValue('');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText(/late private failure/i)).not.toBeInTheDocument();
    });
  });

  it('invalidates search state on reconnect and does not replay the previous query', async () => {
    const client = createClient();
    client.searchFamilyStory.mockResolvedValue({ results: [] });
    render(<SimulatorApp createClient={() => client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('15 tools verified');
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    fireEvent.change(screen.getByLabelText('Search family stories'), {
      target: { value: 'private reconnect query' },
    });
    fireEvent.submit(screen.getByRole('search'));
    await screen.findByText('No matching family stories found.');
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Search family stories')).toHaveValue('');
      expect(screen.getByText('Enter a search to begin.')).toBeVisible();
    });
    expect(client.searchFamilyStory).toHaveBeenCalledTimes(1);
  });
});
