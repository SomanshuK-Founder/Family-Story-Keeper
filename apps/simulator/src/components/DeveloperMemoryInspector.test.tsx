// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import type { GetStoryContextResult, ListPendingConflictsResult } from '@story-keeper/mcp-client';
import { describe, expect, it, vi } from 'vitest';

import { DeveloperMemoryInspector } from './DeveloperMemoryInspector.js';
import '../test-setup.js';

const context: GetStoryContextResult = {
  actor: { id: '00000000-0000-4000-8000-000000000002', displayName: 'Rosa', role: 'narrator' },
  visibility: 'narrator_review',
  facts: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      subjectPersonId: '00000000-0000-4000-8000-000000000002',
      factType: 'home_city',
      value: 'Pune',
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

const conflicts: ListPendingConflictsResult['conflicts'] = [
  {
    contradictionId: '30000000-0000-4000-8000-000000000001',
    contradictionType: 'fact_value',
    status: 'unresolved',
    left: {
      kind: 'fact',
      itemId: '20000000-0000-4000-8000-000000000001',
      factType: 'move_year',
      value: '1962',
      status: 'pending',
      sourceAnswerIds: ['40000000-0000-4000-8000-000000000001'],
    },
    right: {
      kind: 'fact',
      itemId: '20000000-0000-4000-8000-000000000002',
      factType: 'move_year',
      value: '1964',
      status: 'pending',
      sourceAnswerIds: ['40000000-0000-4000-8000-000000000001'],
    },
    suggestedQuestion: 'Was the move in 1962 or 1964?',
  },
];

describe('DeveloperMemoryInspector', () => {
  it('renders safe narrator context and a read-only conflict summary', () => {
    render(
      <DeveloperMemoryInspector
        actor="rosa"
        context={context}
        conflicts={conflicts}
        interviewState="active"
        currentQuestion="Where did you grow up?"
        status="ready"
        error={null}
        connected
        onActorChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Developer Memory Inspector' })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.tagName === 'LI' && element.textContent.includes('Pune'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' && element.textContent === 'Move year: 1962 ↔ Move year: 1964',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Unresolved/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /keep|resolve|dismiss/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/rawText|raw answer/i)).not.toBeInTheDocument();
  });

  it('renders empty story and conflict states', () => {
    render(
      <DeveloperMemoryInspector
        actor="rosa"
        context={{ ...context, facts: [] }}
        conflicts={[]}
        interviewState="none"
        currentQuestion={null}
        status="ready"
        error={null}
        connected
        onActorChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('No structured story items are visible to Rosa.')).toBeInTheDocument();
    expect(screen.getByText('No unresolved conflicts.')).toBeInTheDocument();
  });
});
