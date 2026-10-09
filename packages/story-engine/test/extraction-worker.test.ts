import { randomUUID } from 'node:crypto';

import {
  MockStoryExtractionProvider,
  StoryExtractionProviderError,
  type StoryExtractionProvider,
} from '@story-keeper/bedrock';
import {
  createDatabase,
  demoSeedIds,
  DrizzleExtractionRepository,
  DrizzleInterviewRepository,
  DrizzleJobRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
  seedDemoData,
  type StoryKeeperDatabase,
} from '@story-keeper/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExtractionWorker } from '../src/extraction-worker.js';
import { InterviewService } from '../src/interview-service.js';

const emptyExtraction = {
  people: [],
  relationships: [],
  events: [],
  places: [],
  dateMentions: [],
  factCandidates: [],
  followUpCandidates: [],
} as const;

describe('ExtractionWorker', () => {
  let database: StoryKeeperDatabase;
  let jobs: DrizzleJobRepository;
  let extractions: DrizzleExtractionRepository;
  let memory: DrizzleStoryMemoryRepository;
  let answerId: string;

  beforeEach(() => {
    database = createDatabase(':memory:');
    runMigrations(database);
    seedDemoData(database);
    answerId = saveAnswer(database, 3);
    jobs = new DrizzleJobRepository(database);
    extractions = new DrizzleExtractionRepository(database);
    memory = new DrizzleStoryMemoryRepository(database);
  });

  afterEach(() => {
    database.close();
  });

  it('publishes pending memory, provenance, identity candidates, and contradictions', async () => {
    memory.createFactWithSource({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      factType: 'move_year',
      normalizedValue: '1962',
      confidence: 1,
      answerId,
    });
    memory.createTimelineEvent({
      familyId: demoSeedIds.familyId,
      subjectPersonId: demoSeedIds.rosaPersonId,
      eventType: 'move',
      title: 'Moved to Pune',
      description: 'Earlier account.',
      date: { earliestYear: 1962, latestYear: 1962, precision: 'exact' },
    });
    const provider = new MockStoryExtractionProvider({
      ...emptyExtraction,
      people: [{ reference: 'raj', displayName: 'Raj', confidence: 0.85 }],
      relationships: [
        {
          fromReference: 'narrator',
          toReference: 'raj',
          relationshipType: 'sibling',
          confidence: 0.9,
        },
      ],
      events: [
        {
          subjectReference: 'narrator',
          eventType: 'move',
          title: 'Moved to Pune',
          description: 'Rosa moved to Pune around this time.',
          date: { earliestYear: 1964, latestYear: 1966, precision: 'approximate' },
          confidence: 0.9,
        },
      ],
      factCandidates: [
        {
          subjectReference: 'narrator',
          factType: 'move_year',
          normalizedValue: '1964',
          confidence: 0.9,
          sourceLocator: 'answer',
        },
      ],
    });
    const worker = createWorker(provider);

    expect(await worker.processNext()).toBe('succeeded');

    expect(jobs.listByFamily(demoSeedIds.familyId)[0]?.status).toBe('succeeded');
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.rawAnswer).toBe('My younger brother Raj walked me to school.');
    const storedFacts = memory.listFacts(demoSeedIds.familyId);
    expect(storedFacts).toHaveLength(2);
    expect(storedFacts.every((fact) => fact.status === 'pending')).toBe(true);
    const extractedFact = storedFacts.find((fact) => fact.normalizedValue === '1964');
    expect(extractedFact).toBeDefined();
    expect(memory.listFactSources(demoSeedIds.familyId, extractedFact?.id ?? '')).toEqual([
      expect.objectContaining({ answerId }),
    ]);
    expect(memory.listRelationships(demoSeedIds.familyId)).toEqual([
      expect.objectContaining({ relationshipType: 'sibling', status: 'pending' }),
    ]);
    expect(memory.listTimelineEvents(demoSeedIds.familyId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'pending',
          date: { earliestYear: 1964, latestYear: 1966, precision: 'approximate' },
        }),
      ]),
    );
    expect(memory.listContradictions(demoSeedIds.familyId)).toHaveLength(2);
    expect(extractions.listPersonCandidates(demoSeedIds.familyId)).toEqual([
      expect.objectContaining({ extractedName: 'Raj', status: 'unresolved' }),
    ]);
    expect(
      database.client.prepare('SELECT count(*) AS count FROM relationship_sources').get(),
    ).toEqual({ count: 1 });
    expect(
      database.client.prepare('SELECT count(*) AS count FROM timeline_event_sources').get(),
    ).toEqual({ count: 1 });
  });

  it('treats replay of a succeeded job as a no-op', async () => {
    const worker = createWorker(new MockStoryExtractionProvider(emptyExtraction));
    expect(await worker.processNext()).toBe('succeeded');
    const job = jobs.listByFamily(demoSeedIds.familyId)[0];
    if (job === undefined) throw new Error('Expected the extraction job to exist.');

    expect(
      extractions.publishExtraction({
        jobId: job.id,
        workerId: 'worker-one',
        familyId: demoSeedIds.familyId,
        answerId,
        people: [],
        facts: [],
        relationships: [],
        events: [],
        contradictions: [],
      }),
    ).toBe('already_succeeded');
    expect(await worker.processNext()).toBe('idle');
    expect(memory.listFacts(demoSeedIds.familyId)).toEqual([]);
  });

  it('keeps a high-confidence identical name unresolved instead of reusing one existing person', async () => {
    const existingRajId = addActivePerson('Raj');
    const worker = createWorker(
      new MockStoryExtractionProvider({
        ...emptyExtraction,
        people: [{ reference: 'raj', displayName: 'Raj', confidence: 1 }],
        factCandidates: [
          {
            subjectReference: 'raj',
            factType: 'school_memory',
            normalizedValue: 'Walked Rosa to school',
            confidence: 1,
            sourceLocator: null,
          },
        ],
      }),
    );

    expect(await worker.processNext()).toBe('succeeded');

    const candidates = extractions.listPersonCandidates(demoSeedIds.familyId);
    expect(candidates).toEqual([
      expect.objectContaining({
        extractedName: 'Raj',
        status: 'unresolved',
        possibleMatchPersonId: existingRajId,
        matchScore: 1,
      }),
    ]);
    expect(candidates[0]?.candidatePersonId).not.toBe(existingRajId);
    expect(memory.listFacts(demoSeedIds.familyId)[0]?.subjectPersonId).toBe(
      candidates[0]?.candidatePersonId,
    );
    expect(
      database.client
        .prepare('SELECT canonical_display_name, status FROM people WHERE id = ?')
        .get(existingRajId),
    ).toEqual({ canonical_display_name: 'Raj', status: 'active' });
  });

  it('keeps an identical name unresolved when multiple existing people share it', async () => {
    const firstRajId = addActivePerson('Raj');
    const secondRajId = addActivePerson('Raj');
    const worker = createWorker(
      new MockStoryExtractionProvider({
        ...emptyExtraction,
        people: [{ reference: 'raj', displayName: 'Raj', confidence: 1 }],
      }),
    );

    expect(await worker.processNext()).toBe('succeeded');

    const candidates = extractions.listPersonCandidates(demoSeedIds.familyId);
    expect(candidates).toEqual([
      expect.objectContaining({
        extractedName: 'Raj',
        status: 'unresolved',
        possibleMatchPersonId: null,
        matchScore: null,
      }),
    ]);
    expect(candidates[0]?.candidatePersonId).not.toBe(firstRajId);
    expect(candidates[0]?.candidatePersonId).not.toBe(secondRajId);
  });

  it('reuses an existing person only through an explicit bounded identity reference', async () => {
    const existingRajId = addActivePerson('Raj');
    const worker = createWorker(
      new MockStoryExtractionProvider({
        ...emptyExtraction,
        factCandidates: [
          {
            subjectReference: `person:${existingRajId}`,
            factType: 'school_memory',
            normalizedValue: 'Walked Rosa to school',
            confidence: 1,
            sourceLocator: null,
          },
        ],
      }),
    );

    expect(await worker.processNext()).toBe('succeeded');

    expect(extractions.listPersonCandidates(demoSeedIds.familyId)).toEqual([]);
    expect(memory.listFacts(demoSeedIds.familyId)).toEqual([
      expect.objectContaining({ subjectPersonId: existingRajId, status: 'pending' }),
    ]);
  });

  it('preserves the raw answer and publishes nothing for malformed output', async () => {
    const worker = createWorker(new MockStoryExtractionProvider({ people: [] }));

    expect(await worker.processNext()).toBe('failed');
    expect(jobs.listByFamily(demoSeedIds.familyId)[0]).toMatchObject({
      status: 'failed',
      lastErrorCode: 'INVALID_EXTRACTION',
    });
    expect(memory.listFacts(demoSeedIds.familyId)).toEqual([]);
    expect(
      database.client.prepare('SELECT raw_text FROM answers WHERE id = ?').get(answerId),
    ).toEqual({ raw_text: 'My younger brother Raj walked me to school.' });
  });

  it('retries transient provider errors with a bounded policy', async () => {
    const provider: StoryExtractionProvider = {
      extract: () =>
        Promise.reject(
          new StoryExtractionProviderError(
            'BEDROCK_TRANSIENT',
            true,
            'The Bedrock request failed transiently.',
          ),
        ),
    };
    const worker = createWorker(provider, 0);

    expect(await worker.processNext()).toBe('retrying');
    expect(jobs.listByFamily(demoSeedIds.familyId)[0]).toMatchObject({
      status: 'queued',
      attemptCount: 1,
    });
  });

  it('rejects extracted references outside the bounded same-family context', async () => {
    const worker = createWorker(
      new MockStoryExtractionProvider({
        ...emptyExtraction,
        factCandidates: [
          {
            subjectReference: `person:${randomUUID()}`,
            factType: 'residence',
            normalizedValue: 'Delhi',
            confidence: 0.8,
            sourceLocator: null,
          },
        ],
      }),
    );

    expect(await worker.processNext()).toBe('failed');
    expect(memory.listFacts(demoSeedIds.familyId)).toEqual([]);
    expect(jobs.listByFamily(demoSeedIds.familyId)[0]?.lastErrorCode).toBe('INVALID_EXTRACTION');
  });

  function createWorker(provider: StoryExtractionProvider, retryDelayMs = 1_000): ExtractionWorker {
    return new ExtractionWorker(jobs, extractions, memory, provider, {
      workerId: 'worker-one',
      retryDelayMs,
      contextPeopleLimit: 10,
    });
  }

  function addActivePerson(displayName: string): string {
    const id = randomUUID();
    const now = Date.now();
    database.client
      .prepare(
        `INSERT INTO people (id, family_id, canonical_display_name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      )
      .run(id, demoSeedIds.familyId, displayName, now, now);
    return id;
  }
});

function saveAnswer(database: StoryKeeperDatabase, maxAttempts: number): string {
  const interviews = new DrizzleInterviewRepository(database, maxAttempts);
  const service = new InterviewService(interviews);
  const started = service.startInterview(demoSeedIds.familyId, demoSeedIds.rosaPersonId);
  return service.saveAnswer(
    demoSeedIds.familyId,
    started.interviewId,
    started.questionId,
    'My younger brother Raj walked me to school.',
  ).answerId;
}
