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
  seedDemoShowcaseData,
} from '../../../packages/database/src/index.js';
import { MockStoryExtractionProvider } from '../../../packages/bedrock/src/index.js';
import {
  ExtractionWorker,
  FamilyQuestionService,
  InterviewService,
  NarratorMemoryService,
  PrivacyService,
} from '../../../packages/story-engine/src/index.js';
import { storyKeeperDemoIds } from '../../../packages/shared/src/index.js';

const databasePath = process.env.DATABASE_PATH;
if (databasePath === undefined) throw new Error('DATABASE_PATH is required for browser tests.');

for (const suffix of ['', '-shm', '-wal']) rmSync(`${databasePath}${suffix}`, { force: true });

const database = createDatabase(databasePath);
runMigrations(database);
seedDemoShowcaseData(database);
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
