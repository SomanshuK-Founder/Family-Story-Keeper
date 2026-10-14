// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  GetStoryContextResult,
  ListPendingConflictsResult,
  StoryKeeperClient,
} from '@story-keeper/mcp-client';
import { storyKeeperDemoIds } from '@story-keeper/shared';

import { SimulatorApp } from './SimulatorApp.js';
import './test-setup.js';

const interviewId = '10000000-0000-4000-8000-000000000001';
const firstQuestionId = '10000000-0000-4000-8000-000000000002';
const secondQuestionId = '10000000-0000-4000-8000-000000000003';
const answerId = '10000000-0000-4000-8000-000000000004';

const rosaContext: GetStoryContextResult = {
  actor: { id: storyKeeperDemoIds.rosaPersonId, displayName: 'Rosa', role: 'narrator' },
  visibility: 'narrator_review',
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
  facts: [],
  relationships: [],
  timelineEvents: [],
  chapters: [],
  conflicts: [],
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
        screen.queryByText(/The private garden|The private courtyard/),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('Conflict review is available only in narrator mode.'),
      ).toBeInTheDocument();
    });
    expect(client.listPendingConflicts).toHaveBeenCalledTimes(1);
  });
});
