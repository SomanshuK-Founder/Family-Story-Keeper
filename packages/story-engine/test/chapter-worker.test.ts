import { randomUUID } from 'node:crypto';

import {
  ChapterGenerationProviderError,
  MockChapterGenerationProvider,
  type ChapterGenerationProvider,
} from '@story-keeper/bedrock';
import {
  createDatabase,
  demoSeedIds,
  DrizzleChapterRepository,
  DrizzleInterviewRepository,
  DrizzleJobRepository,
  DrizzleNarratorMemoryRepository,
  DrizzlePrivacyRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
  schema,
  seedDemoData,
  type StoryKeeperDatabase,
} from '@story-keeper/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChapterService } from '../src/chapter-service.js';
import { ChapterWorker } from '../src/chapter-worker.js';
import { InterviewService } from '../src/interview-service.js';
import { PrivacyService } from '../src/privacy-service.js';

describe('Phase 7 grounded chapter pipeline', () => {
  let database: StoryKeeperDatabase;
  let chapters: DrizzleChapterRepository;
  let jobs: DrizzleJobRepository;
  let memory: DrizzleStoryMemoryRepository;
  let privacy: PrivacyService;
  let chapterService: ChapterService;
  let answerId: string;
  let extractionJobId: string;

  beforeEach(() => {
    database = createDatabase(':memory:');
    runMigrations(database);
    seedDemoData(database);
    chapters = new DrizzleChapterRepository(database);
    jobs = new DrizzleJobRepository(database);
    memory = new DrizzleStoryMemoryRepository(database);
    privacy = new PrivacyService(
      new DrizzlePrivacyRepository(database),
      new DrizzleNarratorMemoryRepository(database),
    );
    chapterService = new ChapterService(chapters, 3);
    const interviews = new DrizzleInterviewRepository(database);
    const interview = new InterviewService(interviews).startInterview(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
    );
    answerId = new InterviewService(interviews).saveAnswer(
      demoSeedIds.familyId,
      interview.interviewId,
      interview.questionId,
      'A private source answer that is never sent directly to chapter generation.',
    ).answerId;
    const extractionJob = jobs.listByFamily(demoSeedIds.familyId)[0];
    if (extractionJob?.type !== 'extract_answer') throw new Error('Expected extraction job.');
    extractionJobId = extractionJob.id;
  });

  afterEach(() => {
    database.close();
  });

  it('selects approved narrator-scoped facts, relationships, and events deterministically', () => {
    const sources = createApprovedSources();
    const pending = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'private_pending',
      normalizedValue: 'Pending detail',
      confidence: 0.8,
      answerId,
    }).fact;
    const rejected = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'rejected_detail',
      normalizedValue: 'Rejected detail',
      confidence: 0.8,
      answerId,
    }).fact;
    privacy.approveStoryItem(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'fact',
      rejected.id,
      'reject',
    );
    const crossFamilyFactId = addOtherFamilyApprovedFact();

    const requested = requestDraft();
    expect(requested).toMatchObject({ status: 'queued', sourceCount: 3 });
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    const claimed = jobs.claimNext('chapter-worker', new Date(), 'draft_chapter');
    if (claimed === undefined) throw new Error('Expected chapter job.');
    const generationRequest = chapters.loadGenerationRequest(
      demoSeedIds.familyId,
      requested.chapterDraftId,
      claimed.id,
      claimed.payload.sources,
    );

    expect(generationRequest?.sources.map(({ type, id }) => ({ type, id }))).toEqual([
      { type: 'fact', id: sources.factId },
      { type: 'relationship', id: sources.relationshipId },
      { type: 'timeline_event', id: sources.eventId },
    ]);
    expect(generationRequest?.sources.map(({ id }) => id)).not.toContain(pending.id);
    expect(generationRequest?.sources.map(({ id }) => id)).not.toContain(rejected.id);
    expect(generationRequest?.sources.map(({ id }) => id)).not.toContain(crossFamilyFactId);
    expect(JSON.stringify(generationRequest)).not.toContain('private source answer');
  });

  it('returns insufficient_sources without creating a draft, job, or provider call', async () => {
    expect(requestDraft()).toEqual({
      status: 'insufficient_sources',
      chapterDraftId: null,
      jobId: null,
      sourceCount: 0,
    });
    const oneFact = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'home_city',
      normalizedValue: 'Delhi',
      confidence: 0.9,
      answerId,
    }).fact;
    privacy.approveStoryItem(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'fact',
      oneFact.id,
      'approve',
    );
    const provider = new MockChapterGenerationProvider({
      title: 'Unused',
      body: 'Unused',
      usedSources: [{ type: 'fact', id: oneFact.id }],
    });

    expect(requestDraft()).toEqual({
      status: 'insufficient_sources',
      chapterDraftId: null,
      jobId: null,
      sourceCount: 1,
    });
    expect(await createWorker(provider).processNext()).toBe('idle');
    expect(provider.requests).toEqual([]);
    expect(database.db.select().from(schema.chapterDrafts).all()).toEqual([]);
    expect(
      jobs.listByFamily(demoSeedIds.familyId).filter(({ type }) => type === 'draft_chapter'),
    ).toEqual([]);
  });

  it('excludes approved claims that are still part of an unresolved contradiction', () => {
    const sources = createApprovedSources();
    const conflicting = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'home_city',
      normalizedValue: 'Pune',
      confidence: 0.9,
      answerId,
    }).fact;
    privacy.approveStoryItem(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'fact',
      conflicting.id,
      'approve',
    );
    memory.createContradiction({
      familyId: demoSeedIds.familyId,
      type: 'fact_value',
      leftFactId: sources.factId,
      rightFactId: conflicting.id,
    });

    const requested = requestDraft();
    expect(requested).toMatchObject({ status: 'queued', sourceCount: 2 });
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    const job = jobs.findById(requested.jobId);
    if (job?.type !== 'draft_chapter') throw new Error('Expected chapter job.');
    expect(job.payload.sources).toEqual([
      { type: 'relationship', id: sources.relationshipId },
      { type: 'timeline_event', id: sources.eventId },
    ]);
  });

  it('excludes relationships that still depend on an unresolved person candidate', () => {
    const sources = createApprovedSources();
    const candidatePersonId = addMember('Unresolved Raj', 'relative');
    const relationshipId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.relationships)
      .values({
        id: relationshipId,
        familyId: demoSeedIds.familyId,
        fromPersonId: demoSeedIds.rosaPersonId,
        toPersonId: candidatePersonId,
        relationshipType: 'friend',
        confidence: 0.8,
        approvalStatus: 'approved',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(schema.relationshipSources)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        relationshipId,
        answerId,
        jobId: extractionJobId,
        createdAt: now,
      })
      .run();
    database.db
      .insert(schema.personCandidates)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        candidatePersonId,
        answerId,
        jobId: extractionJobId,
        extractedName: 'Unresolved Raj',
        confidence: 1,
        status: 'unresolved',
        possibleMatchPersonId: null,
        matchScore: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const requested = requestDraft();
    expect(requested).toMatchObject({ status: 'queued', sourceCount: 3 });
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    const job = jobs.findById(requested.jobId);
    if (job?.type !== 'draft_chapter') throw new Error('Expected chapter job.');
    expect(job.payload.sources.map(({ id }) => id)).not.toContain(relationshipId);
    expect(job.payload.sources.map(({ id }) => id)).toContain(sources.relationshipId);
  });

  it('creates the generating draft and chapter job atomically', () => {
    createApprovedSources();
    database.client.exec(`
      CREATE TRIGGER reject_chapter_job
      BEFORE INSERT ON jobs
      WHEN NEW.type = 'draft_chapter'
      BEGIN
        SELECT RAISE(ABORT, 'forced chapter job failure');
      END;
    `);

    expect(() => requestDraft()).toThrow();
    expect(database.db.select().from(schema.chapterDrafts).all()).toEqual([]);
    expect(
      jobs.listByFamily(demoSeedIds.familyId).filter(({ type }) => type === 'draft_chapter'),
    ).toEqual([]);
  });

  it('inherits atomic claim, no-double-claim, and stale-lock recovery from the shared queue', () => {
    createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    const claimedAt = new Date(Date.now() + 1_000);

    expect(jobs.claimNext('worker-one', claimedAt, 'draft_chapter')).toMatchObject({
      id: requested.jobId,
      attemptCount: 1,
      lockedBy: 'worker-one',
    });
    expect(jobs.claimNext('worker-two', claimedAt, 'draft_chapter')).toBeUndefined();
    expect(
      jobs.recoverStaleJobs(
        new Date(claimedAt.getTime() + 1),
        new Date(claimedAt.getTime() + 1_000),
      ),
    ).toBe(1);
    expect(
      jobs.claimNext('worker-two', new Date(claimedAt.getTime() + 1_000), 'draft_chapter'),
    ).toMatchObject({
      id: requested.jobId,
      attemptCount: 2,
      lockedBy: 'worker-two',
    });
  });

  it('publishes a validated draft and exact source links transactionally and idempotently', async () => {
    const sources = createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    expect(
      privacy.getStoryContext(demoSeedIds.familyId, demoSeedIds.rosaPersonId)
        .recoverableChapterDrafts,
    ).toEqual([{ chapterDraftId: requested.chapterDraftId, status: 'generating' }]);
    const provider = new MockChapterGenerationProvider({
      title: 'Rosa’s Early Years',
      body: 'Rosa remembered Delhi and a move around 1962 to 1964.',
      usedSources: [
        { type: 'fact', id: sources.factId },
        { type: 'timeline_event', id: sources.eventId },
      ],
    });
    const worker = createWorker(provider);

    expect(await worker.processNext()).toBe('succeeded');
    expect(provider.requests).toHaveLength(1);
    const review = chapterService.reviewChapter(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      requested.chapterDraftId,
    );
    expect(review).toMatchObject({
      status: 'pending_review',
      title: 'Rosa’s Early Years',
    });
    expect(
      privacy.getStoryContext(demoSeedIds.familyId, demoSeedIds.rosaPersonId)
        .recoverableChapterDrafts,
    ).toEqual([{ chapterDraftId: requested.chapterDraftId, status: 'pending_review' }]);
    expect(review.sources).toEqual([
      expect.objectContaining({ type: 'fact', sourceId: sources.factId }),
      expect.objectContaining({ type: 'timeline_event', sourceId: sources.eventId }),
    ]);
    expect(await worker.processNext()).toBe('idle');
    expect(database.db.select().from(schema.chapterSources).all()).toHaveLength(2);
    expect(jobs.findById(requested.jobId)).toMatchObject({ status: 'succeeded' });
  });

  it('rejects provider-selected evidence outside the backend allowlist without partial publication', async () => {
    createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    const worker = createWorker(
      new MockChapterGenerationProvider({
        title: 'Invalid chapter',
        body: 'This response cites evidence that was never supplied.',
        usedSources: [{ type: 'fact', id: randomUUID() }],
      }),
    );

    expect(await worker.processNext()).toBe('failed');
    expect(database.db.select().from(schema.chapterSources).all()).toEqual([]);
    expect(
      chapterService.reviewChapter(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        requested.chapterDraftId,
      ),
    ).toMatchObject({ status: 'failed', title: null, body: null, sources: [] });
    expect(jobs.findById(requested.jobId)).toMatchObject({
      status: 'failed',
      lastErrorCode: 'CHAPTER_SOURCE_NOT_ELIGIBLE',
    });
    expect(
      privacy.getStoryContext(demoSeedIds.familyId, demoSeedIds.rosaPersonId)
        .recoverableChapterDrafts,
    ).toEqual([{ chapterDraftId: requested.chapterDraftId, status: 'failed' }]);
  });

  it('fails publication atomically when a claimed source becomes ineligible', async () => {
    const sources = createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    let providerObservedClaimedJob = false;
    const provider: ChapterGenerationProvider = {
      generate: (request) => {
        providerObservedClaimedJob = true;
        expect(jobs.findById(requested.jobId)).toMatchObject({
          status: 'running',
          lockedBy: 'chapter-worker',
        });
        expect(request.sources.map(({ type, id }) => ({ type, id }))).toContainEqual({
          type: 'fact',
          id: sources.factId,
        });
        privacy.approveStoryItem(
          demoSeedIds.familyId,
          demoSeedIds.rosaPersonId,
          'fact',
          sources.factId,
          'revoke',
        );
        return Promise.resolve({
          title: 'Must not be published',
          body: 'This body cites a source that became ineligible after the job was claimed.',
          usedSources: [
            { type: 'fact', id: sources.factId },
            { type: 'timeline_event', id: sources.eventId },
          ],
        });
      },
    };

    expect(await createWorker(provider).processNext()).toBe('failed');
    expect(providerObservedClaimedJob).toBe(true);
    expect(jobs.findById(requested.jobId)).toMatchObject({
      status: 'failed',
      lastErrorCode: 'CHAPTER_SOURCE_NOT_ELIGIBLE',
    });
    expect(
      database.db
        .select()
        .from(schema.chapterDrafts)
        .all()
        .find(({ id }) => id === requested.chapterDraftId),
    ).toMatchObject({ status: 'failed', title: null, body: null });
    expect(database.db.select().from(schema.chapterSources).all()).toEqual([]);
    expect(
      chapterService.reviewChapter(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        requested.chapterDraftId,
      ),
    ).toMatchObject({ status: 'failed', title: null, body: null, sources: [] });
  });

  it('fails schema-invalid provider output without publishing partial chapter state', async () => {
    createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');

    expect(
      await createWorker(
        new MockChapterGenerationProvider({ title: 'Invalid', body: '', usedSources: [] }),
      ).processNext(),
    ).toBe('failed');
    expect(database.db.select().from(schema.chapterSources).all()).toEqual([]);
    expect(
      chapterService.reviewChapter(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        requested.chapterDraftId,
      ),
    ).toMatchObject({ status: 'failed', title: null, body: null });
    expect(jobs.findById(requested.jobId)).toMatchObject({
      status: 'failed',
      lastErrorCode: 'INVALID_CHAPTER_OUTPUT',
    });
  });

  it('rejects duplicate provider source references without partial publication', async () => {
    const sources = createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    const duplicateSource = { type: 'fact' as const, id: sources.factId };

    expect(
      await createWorker(
        new MockChapterGenerationProvider({
          title: 'Duplicate evidence',
          body: 'This draft repeats the same evidence reference.',
          usedSources: [duplicateSource, duplicateSource],
        }),
      ).processNext(),
    ).toBe('failed');
    expect(jobs.findById(requested.jobId)).toMatchObject({
      status: 'failed',
      lastErrorCode: 'INVALID_CHAPTER_OUTPUT',
    });
    expect(database.db.select().from(schema.chapterSources).all()).toEqual([]);
    expect(
      chapterService.reviewChapter(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        requested.chapterDraftId,
      ),
    ).toMatchObject({ status: 'failed', title: null, body: null, sources: [] });
  });

  it('retries transient chapter-provider failures with the existing bounded job policy', async () => {
    createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    const provider: ChapterGenerationProvider = {
      generate: () =>
        Promise.reject(
          new ChapterGenerationProviderError(
            'BEDROCK_TRANSIENT',
            true,
            'The Bedrock chapter request failed transiently.',
          ),
        ),
    };

    expect(await createWorker(provider).processNext()).toBe('retrying');
    expect(jobs.findById(requested.jobId)).toMatchObject({
      type: 'draft_chapter',
      status: 'queued',
      attemptCount: 1,
      lastErrorCode: 'BEDROCK_TRANSIENT',
    });
    expect(
      chapterService.reviewChapter(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        requested.chapterDraftId,
      ).status,
    ).toBe('generating');
  });

  it('rolls back all source links and draft/job publication state when a source insert fails', () => {
    const sources = createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    const job = jobs.claimNext('chapter-worker', new Date(), 'draft_chapter');
    if (job === undefined) throw new Error('Expected claimed chapter job.');
    database.client.exec(`
      CREATE TRIGGER reject_second_chapter_source
      BEFORE INSERT ON chapter_sources
      WHEN NEW.source_type = 'timeline_event'
      BEGIN
        SELECT RAISE(ABORT, 'forced source failure');
      END;
    `);

    expect(() =>
      chapters.publishDraft({
        familyId: demoSeedIds.familyId,
        chapterDraftId: requested.chapterDraftId,
        jobId: job.id,
        workerId: 'chapter-worker',
        allowedSources: job.payload.sources,
        chapter: {
          title: 'Atomic publication',
          body: 'All publication writes must commit together.',
          usedSources: [
            { type: 'fact', id: sources.factId },
            { type: 'timeline_event', id: sources.eventId },
          ],
        },
      }),
    ).toThrow();
    expect(database.db.select().from(schema.chapterSources).all()).toEqual([]);
    expect(
      chapterService.reviewChapter(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        requested.chapterDraftId,
      ),
    ).toMatchObject({ status: 'generating', title: null, body: null });
    expect(jobs.findById(job.id)).toMatchObject({ status: 'running' });
  });

  it('keeps review private to the active owning narrator', async () => {
    const sources = createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    await createWorker(
      new MockChapterGenerationProvider({
        title: 'Private draft',
        body: 'A grounded narrator-only draft.',
        usedSources: [{ type: 'fact', id: sources.factId }],
      }),
    ).processNext();
    const relativeId = addMember('Maya', 'relative');
    const childId = addMember('Asha', 'child');
    const otherNarratorId = addMember('Leela', 'narrator');

    expect(() =>
      chapterService.reviewChapter(demoSeedIds.familyId, relativeId, requested.chapterDraftId),
    ).toThrow(expect.objectContaining({ code: 'CHAPTER_ACTOR_NOT_AUTHORIZED' }));
    expect(() =>
      chapterService.reviewChapter(demoSeedIds.familyId, childId, requested.chapterDraftId),
    ).toThrow(expect.objectContaining({ code: 'CHAPTER_ACTOR_NOT_AUTHORIZED' }));
    expect(() =>
      chapterService.reviewChapter(demoSeedIds.familyId, otherNarratorId, requested.chapterDraftId),
    ).toThrow(expect.objectContaining({ code: 'CHAPTER_ACTOR_NOT_AUTHORIZED' }));
    expect(() =>
      chapterService.reviewChapter(
        randomUUID(),
        demoSeedIds.rosaPersonId,
        requested.chapterDraftId,
      ),
    ).toThrow();
    expect(() =>
      chapterService.requestChapterDraft(
        demoSeedIds.familyId,
        childId,
        demoSeedIds.rosaPersonId,
        'childhood',
      ),
    ).toThrow(expect.objectContaining({ code: 'CHAPTER_ACTOR_NOT_AUTHORIZED' }));
    expect(() =>
      chapterService.requestChapterDraft(
        demoSeedIds.familyId,
        relativeId,
        demoSeedIds.rosaPersonId,
        'childhood',
      ),
    ).toThrow(expect.objectContaining({ code: 'CHAPTER_ACTOR_NOT_AUTHORIZED' }));
    expect(() =>
      chapterService.requestChapterDraft(
        demoSeedIds.familyId,
        otherNarratorId,
        demoSeedIds.rosaPersonId,
        'childhood',
      ),
    ).toThrow(expect.objectContaining({ code: 'CHAPTER_ACTOR_NOT_AUTHORIZED' }));
  });

  it('requires narrator review and explicit approval before family visibility', async () => {
    const sources = createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    await createWorker(
      new MockChapterGenerationProvider({
        title: 'Approved memories',
        body: 'Rosa remembered Delhi.',
        usedSources: [{ type: 'fact', id: sources.factId }],
      }),
    ).processNext();
    const relativeId = addMember('Maya', 'relative');
    const childId = addMember('Asha', 'child');

    expect(privacy.getStoryContext(demoSeedIds.familyId, relativeId).chapters).toEqual([]);
    expect(privacy.getStoryContext(demoSeedIds.familyId, childId).chapters).toEqual([]);
    expect(() =>
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        relativeId,
        'chapter',
        requested.chapterDraftId,
        'approve',
      ),
    ).toThrow(expect.objectContaining({ code: 'ACTOR_NOT_AUTHORIZED' }));

    expect(
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'chapter',
        requested.chapterDraftId,
        'approve',
      ),
    ).toMatchObject({ status: 'updated', itemStatus: 'approved' });
    expect(
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'chapter',
        requested.chapterDraftId,
        'approve',
      ),
    ).toMatchObject({ status: 'already_applied', itemStatus: 'approved' });
    expect(
      privacy.getStoryContext(demoSeedIds.familyId, demoSeedIds.rosaPersonId),
    ).not.toHaveProperty('recoverableChapterDrafts');
    expect(privacy.getStoryContext(demoSeedIds.familyId, relativeId).chapters).toEqual([
      expect.objectContaining({
        id: requested.chapterDraftId,
        status: 'approved',
        sourceCount: 1,
      }),
    ]);
    expect(privacy.getStoryContext(demoSeedIds.familyId, childId).chapters).toHaveLength(1);
    expect(database.db.select().from(schema.chapterSources).all()).toHaveLength(1);
    expect(database.db.select().from(schema.approvals).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetType: 'chapter', action: 'approve' }),
      ]),
    );
    expect(database.db.select().from(schema.consentEvents).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetType: 'chapter',
          eventType: 'story_item_approved',
        }),
      ]),
    );
    expect(() =>
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        childId,
        'chapter',
        requested.chapterDraftId,
        'approve',
      ),
    ).toThrow(expect.objectContaining({ code: 'ACTOR_NOT_AUTHORIZED' }));
    expect(JSON.stringify(privacy.getStoryContext(demoSeedIds.familyId, relativeId))).not.toContain(
      'private source answer',
    );
    privacy.approveStoryItem(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      'fact',
      sources.factId,
      'revoke',
    );
    expect(privacy.getStoryContext(demoSeedIds.familyId, relativeId).chapters).toHaveLength(1);
    expect(database.db.select().from(schema.chapterSources).all()).toHaveLength(1);
  });

  it('does not approve a pending-review chapter without source links', () => {
    createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    database.client
      .prepare(
        `UPDATE chapter_drafts
         SET title = ?, body = ?, status = 'pending_review', updated_at = ?
         WHERE id = ?`,
      )
      .run(
        'Unprovenanced draft',
        'This draft has no published chapter source links.',
        Date.now(),
        requested.chapterDraftId,
      );

    expect(() =>
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'chapter',
        requested.chapterDraftId,
        'approve',
      ),
    ).toThrow(expect.objectContaining({ code: 'STORY_ITEM_PROVENANCE_REQUIRED' }));
  });

  it('keeps rejected chapter drafts auditable and hidden from family context', async () => {
    const sources = createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    await createWorker(
      new MockChapterGenerationProvider({
        title: 'Rejected draft',
        body: 'A grounded draft the narrator chose not to share.',
        usedSources: [{ type: 'fact', id: sources.factId }],
      }),
    ).processNext();
    const relativeId = addMember('Maya', 'relative');

    expect(
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        'chapter',
        requested.chapterDraftId,
        'reject',
      ),
    ).toMatchObject({ status: 'updated', itemStatus: 'rejected' });
    expect(privacy.getStoryContext(demoSeedIds.familyId, relativeId).chapters).toEqual([]);
    expect(
      privacy.getStoryContext(demoSeedIds.familyId, demoSeedIds.rosaPersonId),
    ).not.toHaveProperty('recoverableChapterDrafts');
    expect(
      chapterService.reviewChapter(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        requested.chapterDraftId,
      ),
    ).toMatchObject({ status: 'rejected', sources: [expect.any(Object)] });
  });

  it('does not write chapter bodies, prompts, or source text to normal logs', async () => {
    const sources = createApprovedSources();
    const requested = requestDraft();
    if (requested.status !== 'queued') throw new Error('Expected queued chapter.');
    const privateBody = 'Rosa kept the blue diary under the stairs.';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(
        await createWorker(
          new MockChapterGenerationProvider({
            title: 'A private draft',
            body: privateBody,
            usedSources: [{ type: 'fact', id: sources.factId }],
          }),
        ).processNext(),
      ).toBe('succeeded');
      const captured = [...log.mock.calls, ...error.mock.calls].flat().join(' ');
      expect(captured).not.toContain(privateBody);
      expect(captured).not.toContain('private source answer');
      expect(captured).not.toContain('childhood');
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  function requestDraft() {
    return chapterService.requestChapterDraft(
      demoSeedIds.familyId,
      demoSeedIds.rosaPersonId,
      demoSeedIds.rosaPersonId,
      'childhood',
    );
  }

  function createWorker(provider: ChapterGenerationProvider): ChapterWorker {
    return new ChapterWorker(jobs, chapters, provider, {
      workerId: 'chapter-worker',
      retryDelayMs: 0,
    });
  }

  function createApprovedSources(): {
    factId: string;
    relationshipId: string;
    eventId: string;
  } {
    const fact = memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'home_city',
      normalizedValue: 'Delhi',
      confidence: 0.95,
      answerId,
    }).fact;
    const rajId = addMember('Raj', 'relative');
    const relationship = memory.createRelationship({
      familyId: demoSeedIds.familyId,
      fromPersonId: demoSeedIds.rosaPersonId,
      toPersonId: rajId,
      relationshipType: 'sibling',
      confidence: 0.9,
    });
    database.db
      .insert(schema.relationshipSources)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        relationshipId: relationship.id,
        answerId,
        jobId: extractionJobId,
        createdAt: new Date(),
      })
      .run();
    const event = memory.createTimelineEvent({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      eventType: 'move',
      title: 'Moved to Delhi',
      description: 'Rosa remembered moving to Delhi.',
      date: { earliestYear: 1962, latestYear: 1964, precision: 'approximate' },
    });
    database.db
      .insert(schema.timelineEventSources)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        timelineEventId: event.id,
        answerId,
        jobId: extractionJobId,
        createdAt: new Date(),
      })
      .run();
    for (const target of [
      { type: 'fact' as const, id: fact.id },
      { type: 'relationship' as const, id: relationship.id },
      { type: 'timeline_event' as const, id: event.id },
    ]) {
      privacy.approveStoryItem(
        demoSeedIds.familyId,
        demoSeedIds.rosaPersonId,
        target.type,
        target.id,
        'approve',
      );
    }
    return { factId: fact.id, relationshipId: relationship.id, eventId: event.id };
  }

  function addMember(displayName: string, role: 'narrator' | 'relative' | 'child'): string {
    const personId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.people)
      .values({
        id: personId,
        familyId: demoSeedIds.familyId,
        canonicalDisplayName: displayName,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(schema.familyMemberships)
      .values({
        id: randomUUID(),
        familyId: demoSeedIds.familyId,
        personId,
        role,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return personId;
  }

  function addOtherFamilyApprovedFact(): string {
    const familyId = randomUUID();
    const personId = randomUUID();
    const factId = randomUUID();
    const now = new Date();
    database.db
      .insert(schema.families)
      .values({
        id: familyId,
        displayName: 'Other Family',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(schema.people)
      .values({
        id: personId,
        familyId,
        canonicalDisplayName: 'Other Narrator',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(schema.facts)
      .values({
        id: factId,
        familyId,
        subjectPersonId: personId,
        factType: 'private_other_family',
        normalizedValue: 'Never visible',
        confidence: 1,
        approvalStatus: 'approved',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return factId;
  }
});
