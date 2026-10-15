import { rmSync } from 'node:fs';

import {
  createDatabase,
  DrizzleExtractionRepository,
  DrizzleFamilyQuestionRepository,
  DrizzleInterviewRepository,
  DrizzleJobRepository,
  DrizzleNarratorMemoryRepository,
  DrizzlePrivacyRepository,
  DrizzleStoryMemoryRepository,
  runMigrations,
  schema,
  seedDemoShowcaseData,
} from '../../../packages/database/src/index.js';
import { MockStoryExtractionProvider } from '../../../packages/bedrock/src/index.js';
import {
  ExtractionWorker,
  FamilyQuestionService,
  InterviewService,
  NarratorMemoryService,
  PrivacyService,
  startExtractionWorkerLoop,
} from '../../../packages/story-engine/src/index.js';
import { storyKeeperDemoIds } from '../../../packages/shared/src/index.js';

const databasePath = process.env.DATABASE_PATH;
if (databasePath === undefined) throw new Error('DATABASE_PATH is required for browser tests.');

for (const suffix of ['', '-shm', '-wal']) rmSync(`${databasePath}${suffix}`, { force: true });

const database = createDatabase(databasePath);
runMigrations(database);
seedDemoShowcaseData(database);
const now = new Date();
const knownRajPersonId = '00000000-0000-4000-8000-000000000008';
database.db.transaction((transaction) => {
  transaction
    .insert(schema.people)
    .values({
      id: knownRajPersonId,
      familyId: storyKeeperDemoIds.familyId,
      canonicalDisplayName: 'Raj',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  transaction
    .insert(schema.familyMemberships)
    .values({
      id: '00000000-0000-4000-8000-000000000009',
      familyId: storyKeeperDemoIds.familyId,
      personId: knownRajPersonId,
      role: 'relative',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .run();
});
const interviews = new DrizzleInterviewRepository(database);
const narratorMemory = new DrizzleNarratorMemoryRepository(database);
const interviewService = new InterviewService(
  interviews,
  new NarratorMemoryService(interviews, narratorMemory),
  new FamilyQuestionService(new DrizzleFamilyQuestionRepository(database)),
);
const started = interviewService.startInterview(
  storyKeeperDemoIds.familyId,
  storyKeeperDemoIds.rosaPersonId,
);
const saved = interviewService.saveAnswer(
  storyKeeperDemoIds.familyId,
  started.interviewId,
  started.questionId,
  'Rosa remembered the garden beside the old market.',
);
const memory = new DrizzleStoryMemoryRepository(database);
const worker = new ExtractionWorker(
  new DrizzleJobRepository(database),
  new DrizzleExtractionRepository(database),
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
  { workerId: 'phase-2-browser-seed', retryDelayMs: 0 },
);
if ((await worker.processNext()) !== 'succeeded') throw new Error('Browser memory seed failed.');
const firstFact = memory.listFacts(storyKeeperDemoIds.familyId)[0];
const event = memory.listTimelineEvents(storyKeeperDemoIds.familyId)[0];
if (firstFact === undefined || event === undefined)
  throw new Error('Browser memory seed is incomplete.');
const secondFact = memory.createFactWithSource({
  familyId: storyKeeperDemoIds.familyId,
  subjectPersonId: storyKeeperDemoIds.rosaPersonId,
  factType: 'favorite_place',
  normalizedValue: 'The old market square',
  confidence: 0.85,
  answerId: saved.answerId,
}).fact;
memory.createContradiction({
  familyId: storyKeeperDemoIds.familyId,
  type: 'fact_value',
  leftFactId: firstFact.id,
  rightFactId: secondFact.id,
});
new PrivacyService(new DrizzlePrivacyRepository(database), narratorMemory).approveStoryItem(
  storyKeeperDemoIds.familyId,
  storyKeeperDemoIds.rosaPersonId,
  'timeline_event',
  event.id,
  'approve',
);
database.close();

await import('../../../packages/mcp-server/src/index.js');

const processingDatabase = createDatabase(databasePath);
const processingJobs = new DrizzleJobRepository(processingDatabase);
const processingLoop = startExtractionWorkerLoop(
  new ExtractionWorker(
    processingJobs,
    new DrizzleExtractionRepository(processingDatabase),
    new DrizzleStoryMemoryRepository(processingDatabase),
    new MockStoryExtractionProvider({
      people: [
        { reference: 'raj', displayName: 'Raj', confidence: 1 },
        { reference: 'devika', displayName: 'Devika', confidence: 1 },
      ],
      relationships: [
        {
          fromReference: 'narrator',
          toReference: `person:${storyKeeperDemoIds.mayaPersonId}`,
          relationshipType: 'child',
          confidence: 0.95,
        },
        {
          fromReference: 'narrator',
          toReference: 'raj',
          relationshipType: 'sibling',
          confidence: 0.92,
        },
      ],
      places: [],
      dateMentions: [],
      followUpCandidates: [],
      factCandidates: [
        {
          subjectReference: 'narrator',
          factType: 'garden_sound',
          normalizedValue: 'The garden gate in the evening breeze',
          confidence: 0.96,
          sourceLocator: null,
        },
      ],
      events: [
        {
          subjectReference: 'narrator',
          eventType: 'garden_memory',
          title: 'Evenings by the garden gate',
          description: 'Rosa remembered the garden gate moving in the evening breeze.',
          date: { earliestYear: 1974, latestYear: 1974, precision: 'approximate' },
          confidence: 0.92,
        },
      ],
    }),
    { workerId: 'phase-4-browser-processing', retryDelayMs: 0 },
  ),
  processingJobs,
  { pollIntervalMs: 500, lockTimeoutMs: 60_000 },
);

async function stopProcessingHarness(): Promise<void> {
  await processingLoop.stop();
  processingDatabase.close();
}

process.once('SIGINT', () => void stopProcessingHarness());
process.once('SIGTERM', () => void stopProcessingHarness());
