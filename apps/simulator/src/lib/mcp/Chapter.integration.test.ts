// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ChapterGenerationProvider } from '@story-keeper/bedrock';
import { MockStoryExtractionProvider } from '@story-keeper/bedrock';
import {
  DrizzleChapterRepository,
  DrizzleExtractionRepository,
  DrizzleJobRepository,
  DrizzleStoryMemoryRepository,
  seedDemoShowcaseData,
} from '@story-keeper/database';
import { StoryKeeperMcpClient } from '@story-keeper/mcp-client';
import { storyKeeperDemoIds } from '@story-keeper/shared';
import { ChapterWorker, ExtractionWorker } from '@story-keeper/story-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  startTestRuntime,
  type TestRuntime,
} from '../../../../../packages/mcp-server/test/runtime.js';

describe('chapter lifecycle through the real browser MCP client', () => {
  let directory: string;
  let runtime: TestRuntime;
  let client: StoryKeeperMcpClient;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'story-keeper-person-b-phase-8-'));
    runtime = await startTestRuntime(join(directory, 'chapter.sqlite'));
    seedDemoShowcaseData(runtime.database);
    client = new StoryKeeperMcpClient(runtime.mcpUrl);
    await client.connect();
    await createApprovedChapterSources(runtime, client);
  });

  afterEach(async () => {
    await client.disconnect();
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('recovers a draft after reconnect, reviews it, and publishes only after approval', async () => {
    const requested = await client.requestChapterDraft({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      narratorPersonId: storyKeeperDemoIds.rosaPersonId,
      chapterTopic: '  Rosa’s early years  ',
    });
    expect(requested).toMatchObject({ status: 'queued', sourceCount: 2 });
    expect(requested.chapterDraftId).toEqual(expect.any(String));
    const chapterDraftId = requested.chapterDraftId;
    if (chapterDraftId === null) throw new Error('Expected a queued chapter draft.');

    await client.disconnect();
    client = new StoryKeeperMcpClient(runtime.mcpUrl);
    await client.connect();
    await expect(
      client.getStoryContext({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.rosaPersonId,
      }),
    ).resolves.toMatchObject({
      recoverableChapterDrafts: [{ chapterDraftId, status: 'generating' }],
    });

    const worker = createChapterWorker(runtime);
    await expect(worker.processNext()).resolves.toBe('succeeded');
    const pending = await client.getStoryContext({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
    });
    expect(pending.recoverableChapterDrafts).toEqual([
      { chapterDraftId, status: 'pending_review' },
    ]);
    expect(pending.chapters).toEqual([]);

    const review = await client.reviewChapter({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      chapterDraftId,
    });
    expect(review).toMatchObject({
      chapterDraftId,
      chapterTopic: 'Rosa’s early years',
      title: 'Beside the Old Market',
      status: 'pending_review',
    });
    expect(review.sources).toHaveLength(2);

    await expect(
      client.reviewChapter({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.mayaPersonId,
        chapterDraftId,
      }),
    ).rejects.toMatchObject({ code: 'authorization' });
    await expect(
      client.requestChapterDraft({
        familyId: storyKeeperDemoIds.familyId,
        actorPersonId: storyKeeperDemoIds.mayaPersonId,
        narratorPersonId: storyKeeperDemoIds.rosaPersonId,
        chapterTopic: 'Not allowed',
      }),
    ).rejects.toMatchObject({ code: 'authorization' });

    await client.approveStoryItem({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'chapter',
      targetId: chapterDraftId,
      action: 'approve',
    });
    const rosa = await client.getStoryContext({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
    });
    expect(rosa.recoverableChapterDrafts).toBeUndefined();
    expect(rosa.chapters).toMatchObject([{ id: chapterDraftId, status: 'approved' }]);
    const maya = await client.getStoryContext({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.mayaPersonId,
    });
    expect(maya.recoverableChapterDrafts).toBeUndefined();
    expect(maya.chapters).toMatchObject([{ id: chapterDraftId, status: 'approved' }]);
  });

  it('rejects a reviewable chapter and keeps it out of approved-family context', async () => {
    const requested = await client.requestChapterDraft({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      narratorPersonId: storyKeeperDemoIds.rosaPersonId,
      chapterTopic: 'A chapter to reject',
    });
    if (requested.chapterDraftId === null) throw new Error('Expected a queued chapter draft.');
    await expect(createChapterWorker(runtime).processNext()).resolves.toBe('succeeded');
    await client.approveStoryItem({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
      targetType: 'chapter',
      targetId: requested.chapterDraftId,
      action: 'reject',
    });
    const rosa = await client.getStoryContext({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.rosaPersonId,
    });
    const maya = await client.getStoryContext({
      familyId: storyKeeperDemoIds.familyId,
      actorPersonId: storyKeeperDemoIds.mayaPersonId,
    });
    expect(rosa.recoverableChapterDrafts).toBeUndefined();
    expect(rosa.chapters).toEqual([]);
    expect(maya.chapters).toEqual([]);
  });
});

async function createApprovedChapterSources(
  runtime: TestRuntime,
  client: StoryKeeperMcpClient,
): Promise<void> {
  const started = await client.startInterview({
    familyId: storyKeeperDemoIds.familyId,
    personId: storyKeeperDemoIds.rosaPersonId,
  });
  await client.saveAnswer({
    familyId: storyKeeperDemoIds.familyId,
    interviewId: started.interviewId,
    questionId: started.questionId,
    rawText: 'Rosa remembered the private garden and moving near the old market.',
  });
  const memory = new DrizzleStoryMemoryRepository(runtime.database);
  const worker = new ExtractionWorker(
    new DrizzleJobRepository(runtime.database),
    new DrizzleExtractionRepository(runtime.database),
    memory,
    new MockStoryExtractionProvider({
      people: [],
      relationships: [],
      places: [],
      dateMentions: [],
      followUpCandidates: [],
      factCandidates: [
        {
          subjectReference: 'narrator',
          factType: 'favorite_place',
          normalizedValue: 'The private garden',
          confidence: 0.95,
          sourceLocator: null,
        },
      ],
      events: [
        {
          subjectReference: 'narrator',
          eventType: 'move',
          title: 'Moved near the old market',
          description: 'Rosa remembered moving near the old market.',
          date: { earliestYear: 1962, latestYear: 1964, precision: 'range' },
          confidence: 0.9,
        },
      ],
    }),
    { workerId: 'phase-8-client-sources', retryDelayMs: 0 },
  );
  await expect(worker.processNext()).resolves.toBe('succeeded');
  const fact = memory.listFacts(storyKeeperDemoIds.familyId)[0];
  const event = memory.listTimelineEvents(storyKeeperDemoIds.familyId)[0];
  if (fact === undefined || event === undefined) throw new Error('Expected chapter sources.');
  await client.approveStoryItem({
    familyId: storyKeeperDemoIds.familyId,
    actorPersonId: storyKeeperDemoIds.rosaPersonId,
    targetType: 'fact',
    targetId: fact.id,
    action: 'approve',
  });
  await client.approveStoryItem({
    familyId: storyKeeperDemoIds.familyId,
    actorPersonId: storyKeeperDemoIds.rosaPersonId,
    targetType: 'timeline_event',
    targetId: event.id,
    action: 'approve',
  });
}

function createChapterWorker(runtime: TestRuntime): ChapterWorker {
  const provider: ChapterGenerationProvider = {
    generate: (request) =>
      Promise.resolve({
        title: 'Beside the Old Market',
        body: 'Rosa remembered the private garden and the old market that shaped her early years.',
        usedSources: request.sources.slice(0, 2).map(({ type, id }) => ({ type, id })),
      }),
  };
  return new ChapterWorker(
    new DrizzleJobRepository(runtime.database),
    new DrizzleChapterRepository(runtime.database),
    provider,
    { workerId: 'phase-8-client-chapter', retryDelayMs: 0 },
  );
}
