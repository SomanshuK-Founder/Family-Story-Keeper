// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  GetNextQuestionResult,
  GetStoryContextResult,
  ListPendingConflictsResult,
  StoryKeeperClient,
} from '@story-keeper/mcp-client';
import { StoryKeeperClientError } from '@story-keeper/mcp-client';
import { storyKeeperDemoIds } from '@story-keeper/shared';

import { SimulatorApp } from './SimulatorApp.js';
import './test-setup.js';

const interviewId = '10000000-0000-4000-8000-000000000001';
const firstQuestionId = '10000000-0000-4000-8000-000000000002';
const secondQuestionId = '10000000-0000-4000-8000-000000000003';
const answerId = '10000000-0000-4000-8000-000000000004';
const privateCandidatePersonId = '10000000-0000-4000-8000-000000000005';

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
    getTimeline: vi.fn<StoryKeeperClient['getTimeline']>(() => Promise.resolve({ items: [] })),
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
});
