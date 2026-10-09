import { MockChapterGenerationProvider, MockStoryExtractionProvider } from '@story-keeper/bedrock';
import {
  demoShowcaseSeedIds,
  DrizzleChapterRepository,
  DrizzleExtractionRepository,
  DrizzleJobRepository,
  DrizzleStoryMemoryRepository,
  SqliteSearchRepository,
  seedDemoShowcaseData,
} from '@story-keeper/database';
import { ChapterWorker, ExtractionWorker } from '@story-keeper/story-engine';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startTestRuntime, type TestRuntime } from './runtime.js';

const privateAnswer = 'Rosa kept the brass key inside the green sewing box.';

describe('complete local backend journey', () => {
  let runtime: TestRuntime | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
  });

  it('composes interview, extraction, approval, family queue, chapter, presentation, and search', async () => {
    runtime = await startTestRuntime(':memory:');
    seedDemoShowcaseData(runtime.database);
    const jobs = new DrizzleJobRepository(runtime.database);
    const memory = new DrizzleStoryMemoryRepository(runtime.database);
    const extractionProvider = new MockStoryExtractionProvider({
      people: [],
      relationships: [
        {
          fromReference: 'narrator',
          toReference: `person:${demoShowcaseSeedIds.mayaPersonId}`,
          relationshipType: 'child',
          confidence: 1,
        },
      ],
      events: [
        {
          subjectReference: 'narrator',
          eventType: 'keepsake',
          title: 'Kept a brass key',
          description: 'A brass key was kept in a green sewing box.',
          date: { earliestYear: null, latestYear: null, precision: 'unknown' },
          confidence: 1,
        },
      ],
      places: [],
      dateMentions: [],
      factCandidates: [
        {
          subjectReference: 'narrator',
          factType: 'keepsake_location',
          normalizedValue: 'Brass key in a green sewing box',
          confidence: 1,
          sourceLocator: null,
        },
      ],
      followUpCandidates: [],
    });
    const extractionWorker = new ExtractionWorker(
      jobs,
      new DrizzleExtractionRepository(runtime.database),
      memory,
      extractionProvider,
      { workerId: 'demo-extraction-worker', retryDelayMs: 0 },
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const started = runtime.interviewService.startInterview(
        demoShowcaseSeedIds.familyId,
        demoShowcaseSeedIds.rosaPersonId,
      );
      expect(
        runtime.interviewService.getNextQuestion(demoShowcaseSeedIds.familyId, started.interviewId)
          .questionId,
      ).toBe(started.questionId);
      runtime.interviewService.saveAnswer(
        demoShowcaseSeedIds.familyId,
        started.interviewId,
        started.questionId,
        privateAnswer,
      );
      expect(extractionProvider.requests).toEqual([]);
      expect(await extractionWorker.processNext()).toBe('succeeded');

      const [fact] = memory.listFacts(demoShowcaseSeedIds.familyId);
      const [relationship] = memory.listRelationships(demoShowcaseSeedIds.familyId);
      const [event] = memory.listTimelineEvents(demoShowcaseSeedIds.familyId);
      if (fact === undefined || relationship === undefined || event === undefined) {
        throw new Error('Expected extracted demo memory.');
      }
      expect([fact.status, relationship.status, event.status]).toEqual([
        'pending',
        'pending',
        'pending',
      ]);
      expect(
        runtime.privacyService.getStoryContext(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
        ).facts,
      ).toEqual([]);
      expect(
        runtime.searchService.searchFamilyStory(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
          'brass key',
          10,
        ).results,
      ).toEqual([]);
      for (const actorPersonId of [
        demoShowcaseSeedIds.mayaPersonId,
        demoShowcaseSeedIds.arunPersonId,
      ]) {
        expect(
          runtime.privacyService.getStoryContext(demoShowcaseSeedIds.familyId, actorPersonId),
        ).toMatchObject({ facts: [], relationships: [], timelineEvents: [], chapters: [] });
        expect(
          runtime.presentationService.getTimeline(demoShowcaseSeedIds.familyId, actorPersonId)
            .items,
        ).toEqual([]);
        expect(
          runtime.presentationService.getFamilyGraph(demoShowcaseSeedIds.familyId, actorPersonId)
            .edges,
        ).toEqual([]);
        expect(
          runtime.presentationService.getApprovedChapters(
            demoShowcaseSeedIds.familyId,
            actorPersonId,
          ).chapters,
        ).toEqual([]);
        expect(
          runtime.searchService.searchFamilyStory(
            demoShowcaseSeedIds.familyId,
            actorPersonId,
            'brass key',
            10,
          ).results,
        ).toEqual([]);
      }

      for (const target of [
        { type: 'fact' as const, id: fact.id },
        { type: 'relationship' as const, id: relationship.id },
        { type: 'timeline_event' as const, id: event.id },
      ]) {
        runtime.privacyService.approveStoryItem(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.rosaPersonId,
          target.type,
          target.id,
          'approve',
        );
      }

      runtime.familyQuestionService.queueFamilyQuestion(
        demoShowcaseSeedIds.familyId,
        demoShowcaseSeedIds.mayaPersonId,
        demoShowcaseSeedIds.rosaPersonId,
        'Where did you keep the key?',
      );
      const familyQuestion = runtime.interviewService.getNextQuestion(
        demoShowcaseSeedIds.familyId,
        started.interviewId,
      );
      expect(familyQuestion.questionText).toContain('Maya left you a question');
      if (familyQuestion.questionId === null) throw new Error('Expected the queued question.');
      runtime.interviewService.saveAnswer(
        demoShowcaseSeedIds.familyId,
        started.interviewId,
        familyQuestion.questionId,
        'I kept it safely with my sewing things.',
      );

      const requested = runtime.chapterService.requestChapterDraft(
        demoShowcaseSeedIds.familyId,
        demoShowcaseSeedIds.rosaPersonId,
        demoShowcaseSeedIds.rosaPersonId,
        'family keepsakes',
      );
      if (requested.status !== 'queued') throw new Error('Expected a queued chapter draft.');
      const chapterProvider = new MockChapterGenerationProvider({
        title: 'The Brass Key',
        body: 'Rosa remembered keeping a brass key safely in a green sewing box.',
        usedSources: [
          { type: 'fact', id: fact.id },
          { type: 'timeline_event', id: event.id },
        ],
      });
      const chapterWorker = new ChapterWorker(
        jobs,
        new DrizzleChapterRepository(runtime.database),
        chapterProvider,
        { workerId: 'demo-chapter-worker', retryDelayMs: 0 },
      );
      expect(await chapterWorker.processNext()).toBe('succeeded');
      expect(
        runtime.chapterService.reviewChapter(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.rosaPersonId,
          requested.chapterDraftId,
        ),
      ).toMatchObject({ status: 'pending_review', title: 'The Brass Key' });
      runtime.privacyService.approveStoryItem(
        demoShowcaseSeedIds.familyId,
        demoShowcaseSeedIds.rosaPersonId,
        'chapter',
        requested.chapterDraftId,
        'approve',
      );

      expect(
        runtime.presentationService.getTimeline(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
        ).items,
      ).toHaveLength(1);
      expect(
        runtime.presentationService.getFamilyGraph(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
        ).edges,
      ).toHaveLength(1);
      expect(
        runtime.presentationService.getApprovedChapters(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
        ).chapters,
      ).toHaveLength(1);
      expect(
        runtime.searchService.searchFamilyStory(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
          'brass key',
          10,
        ).results.length,
      ).toBeGreaterThan(0);

      const publicOutputs = JSON.stringify({
        context: runtime.privacyService.getStoryContext(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
        ),
        timeline: runtime.presentationService.getTimeline(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
        ),
        graph: runtime.presentationService.getFamilyGraph(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
        ),
      });
      expect(publicOutputs).not.toContain(privateAnswer);
      expect([...log.mock.calls, ...error.mock.calls].flat().join(' ')).not.toContain(
        privateAnswer,
      );
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it('recovers durable interviews, stale work, family questions, chapter work, and search after restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'story-keeper-restart-'));
    const databasePath = join(directory, 'story.sqlite');
    try {
      runtime = await startTestRuntime(databasePath);
      seedDemoShowcaseData(runtime.database);
      const started = runtime.interviewService.startInterview(
        demoShowcaseSeedIds.familyId,
        demoShowcaseSeedIds.rosaPersonId,
      );
      const saved = runtime.interviewService.saveAnswer(
        demoShowcaseSeedIds.familyId,
        started.interviewId,
        started.questionId,
        'A durable fictional answer.',
      );
      const jobsBefore = new DrizzleJobRepository(runtime.database);
      const claimedAt = new Date();
      const running = jobsBefore.claimNext('interrupted-worker', claimedAt);
      expect(running?.status).toBe('running');
      const memory = new DrizzleStoryMemoryRepository(runtime.database);
      const facts = [
        memory.createFactWithSource({
          familyId: demoShowcaseSeedIds.familyId,
          subjectPersonId: demoShowcaseSeedIds.rosaPersonId,
          factType: 'demo_place',
          normalizedValue: 'Fictional orchard',
          confidence: 1,
          answerId: saved.answerId,
        }).fact,
        memory.createFactWithSource({
          familyId: demoShowcaseSeedIds.familyId,
          subjectPersonId: demoShowcaseSeedIds.rosaPersonId,
          factType: 'demo_keepsake',
          normalizedValue: 'Brass key',
          confidence: 1,
          answerId: saved.answerId,
        }).fact,
      ];
      for (const fact of facts) {
        runtime.privacyService.approveStoryItem(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.rosaPersonId,
          'fact',
          fact.id,
          'approve',
        );
      }
      runtime.familyQuestionService.queueFamilyQuestion(
        demoShowcaseSeedIds.familyId,
        demoShowcaseSeedIds.mayaPersonId,
        demoShowcaseSeedIds.rosaPersonId,
        'What did the orchard look like?',
      );
      expect(
        runtime.chapterService.requestChapterDraft(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.rosaPersonId,
          demoShowcaseSeedIds.rosaPersonId,
          'orchard',
        ).status,
      ).toBe('queued');
      await runtime.close();
      runtime = undefined;

      runtime = await startTestRuntime(databasePath);
      const jobsAfter = new DrizzleJobRepository(runtime.database);
      expect(
        jobsAfter.recoverStaleJobs(
          new Date(claimedAt.getTime() + 1),
          new Date(claimedAt.getTime() + 2),
        ),
      ).toBe(1);
      expect(jobsAfter.findById(running?.id ?? '')).toMatchObject({
        status: 'queued',
        lastErrorCode: 'WORKER_LOCK_EXPIRED',
      });
      expect(jobsAfter.listByFamily(demoShowcaseSeedIds.familyId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'draft_chapter', status: 'queued' }),
        ]),
      );
      expect(
        runtime.interviewService.startInterview(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.rosaPersonId,
        ).interviewId,
      ).toBe(started.interviewId);
      expect(
        runtime.interviewService.getNextQuestion(demoShowcaseSeedIds.familyId, started.interviewId)
          .questionText,
      ).toContain('Maya left you a question');
      const search = new SqliteSearchRepository(runtime.database);
      const firstCount = search.rebuild();
      expect(search.rebuild()).toBe(firstCount);
      expect(
        runtime.searchService.searchFamilyStory(
          demoShowcaseSeedIds.familyId,
          demoShowcaseSeedIds.mayaPersonId,
          'orchard',
          10,
        ).results,
      ).toHaveLength(1);
    } finally {
      await runtime?.close();
      runtime = undefined;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
