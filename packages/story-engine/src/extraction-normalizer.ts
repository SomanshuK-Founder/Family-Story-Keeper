import { randomUUID } from 'node:crypto';

import type {
  FactRecord,
  PublishContradiction,
  PublishExtractionInput,
  PublishFact,
  PublishPersonCandidate,
  PublishRelationship,
  PublishTimelineEvent,
  TimelineEventRecord,
} from '@story-keeper/database';
import type { StoryExtraction, StoryExtractionRequest } from '@story-keeper/shared';

import { scoreNameMatch } from './name-matching.js';
import { detectFactContradiction, detectTimelineDateContradiction } from './story-memory.js';
import { normalizeRelationshipType, validateApproximateDate } from './story-memory.js';

export interface NormalizeExtractionInput {
  readonly jobId: string;
  readonly workerId: string;
  readonly familyId: string;
  readonly request: StoryExtractionRequest;
  readonly extraction: StoryExtraction;
  readonly existingFacts: readonly FactRecord[];
  readonly existingEvents: readonly TimelineEventRecord[];
}

export class ExtractionNormalizationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ExtractionNormalizationError';
  }
}

export function normalizeExtraction(input: NormalizeExtractionInput): PublishExtractionInput {
  const references = new Map<string, string>();
  references.set('narrator', input.request.narrator.id);
  for (const person of input.request.knownPeople) references.set(person.reference, person.id);

  const people: PublishPersonCandidate[] = [];
  for (const extracted of input.extraction.people) {
    if (references.has(extracted.reference)) {
      throw new ExtractionNormalizationError('The extraction reused a reserved person reference.');
    }
    const displayName = normalizeDisplayName(extracted.displayName);
    const matches = input.request.knownPeople.map((known) =>
      scoreNameMatch(
        { id: extracted.reference, name: displayName },
        { id: known.id, name: known.displayName },
      ),
    );
    const sortedMatches = matches.toSorted((left, right) => right.score - left.score);
    const bestMatch = sortedMatches[0];
    const bestMatchIsUnique =
      bestMatch !== undefined &&
      !sortedMatches.some((match) => match !== bestMatch && match.score === bestMatch.score);
    const personId = randomUUID();
    references.set(extracted.reference, personId);
    people.push({
      id: randomUUID(),
      personId,
      displayName,
      confidence: extracted.confidence,
      possibleMatchPersonId:
        bestMatchIsUnique &&
        (bestMatch.classification === 'possible' || bestMatch.classification === 'exact')
          ? bestMatch.right.id
          : null,
      matchScore:
        bestMatchIsUnique &&
        (bestMatch.classification === 'possible' || bestMatch.classification === 'exact')
          ? bestMatch.score
          : null,
    });
  }

  const facts = deduplicateFacts(
    input.extraction.factCandidates.map((fact): PublishFact => ({
      id: randomUUID(),
      sourceId: randomUUID(),
      subjectPersonId: requireReference(references, fact.subjectReference),
      factType: normalizeToken(fact.factType),
      normalizedValue: fact.normalizedValue.normalize('NFKC').trim(),
      confidence: fact.confidence,
      sourceLocator: fact.sourceLocator,
    })),
  );
  const relationships = deduplicateRelationships(
    input.extraction.relationships.map((relationship): PublishRelationship => ({
      id: randomUUID(),
      sourceId: randomUUID(),
      fromPersonId: requireReference(references, relationship.fromReference),
      toPersonId: requireReference(references, relationship.toReference),
      relationshipType: normalizeRelationshipType(relationship.relationshipType),
      confidence: relationship.confidence,
    })),
  );
  const events = deduplicateEvents(
    input.extraction.events.map((event): PublishTimelineEvent => ({
      id: randomUUID(),
      sourceId: randomUUID(),
      subjectPersonId: requireReference(references, event.subjectReference),
      eventType: normalizeToken(event.eventType),
      title: event.title.trim(),
      description: event.description.trim(),
      date: validateApproximateDate(event.date),
    })),
  );

  return {
    jobId: input.jobId,
    workerId: input.workerId,
    familyId: input.familyId,
    answerId: input.request.answerId,
    people,
    facts,
    relationships,
    events,
    contradictions: buildContradictions(input.existingFacts, facts, input.existingEvents, events),
  };
}

function buildContradictions(
  existingFacts: readonly FactRecord[],
  newFacts: readonly PublishFact[],
  existingEvents: readonly TimelineEventRecord[],
  newEvents: readonly PublishTimelineEvent[],
): readonly PublishContradiction[] {
  const contradictions: PublishContradiction[] = [];
  const factPool = existingFacts.map((fact) => ({
    id: fact.id,
    conceptKey: factConcept(fact.subjectPersonId, fact.factType),
    normalizedValue: fact.normalizedValue,
  }));
  for (const fact of newFacts) {
    const comparable = {
      id: fact.id,
      conceptKey: factConcept(fact.subjectPersonId, fact.factType),
      normalizedValue: fact.normalizedValue,
    };
    for (const prior of factPool) {
      const conflict = detectFactContradiction(prior, comparable);
      if (conflict?.type === 'fact_value') {
        const [leftFactId, rightFactId] = canonicalPair(conflict.leftFactId, conflict.rightFactId);
        contradictions.push({ id: randomUUID(), type: 'fact_value', leftFactId, rightFactId });
      }
    }
    factPool.push(comparable);
  }

  const eventPool = existingEvents.map((event) => ({
    id: event.id,
    conceptKey: eventConcept(event.subjectPersonId, event.eventType, event.title),
    date: event.date,
  }));
  for (const event of newEvents) {
    const comparable = {
      id: event.id,
      conceptKey: eventConcept(event.subjectPersonId, event.eventType, event.title),
      date: event.date,
    };
    for (const prior of eventPool) {
      const conflict = detectTimelineDateContradiction(prior, comparable);
      if (conflict?.type === 'timeline_date') {
        const [leftTimelineEventId, rightTimelineEventId] = canonicalPair(
          conflict.leftTimelineEventId,
          conflict.rightTimelineEventId,
        );
        contradictions.push({
          id: randomUUID(),
          type: 'timeline_date',
          leftTimelineEventId,
          rightTimelineEventId,
        });
      }
    }
    eventPool.push(comparable);
  }
  return contradictions;
}

function canonicalPair(left: string, right: string): readonly [string, string] {
  return left <= right ? [left, right] : [right, left];
}

function requireReference(references: ReadonlyMap<string, string>, reference: string): string {
  const id = references.get(reference);
  if (id === undefined) {
    throw new ExtractionNormalizationError('The extraction referenced an unknown person.');
  }
  return id;
}

function normalizeDisplayName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeToken(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, '_');
}

function factConcept(personId: string, factType: string): string {
  return `${personId}:${normalizeToken(factType)}`;
}

function eventConcept(personId: string, eventType: string, title: string): string {
  return `${personId}:${normalizeToken(eventType)}:${normalizeToken(title)}`;
}

function deduplicateFacts(values: readonly PublishFact[]): readonly PublishFact[] {
  return uniqueBy(values, (fact) =>
    [fact.subjectPersonId, fact.factType, fact.normalizedValue.toLocaleLowerCase('en')].join(
      '\u0000',
    ),
  );
}

function deduplicateRelationships(
  values: readonly PublishRelationship[],
): readonly PublishRelationship[] {
  return uniqueBy(values, (relationship) =>
    [relationship.fromPersonId, relationship.toPersonId, relationship.relationshipType].join(
      '\u0000',
    ),
  );
}

function deduplicateEvents(
  values: readonly PublishTimelineEvent[],
): readonly PublishTimelineEvent[] {
  return uniqueBy(values, (event) =>
    [
      event.subjectPersonId,
      event.eventType,
      event.title.toLocaleLowerCase('en'),
      event.date.precision,
      event.date.earliestYear,
      event.date.latestYear,
    ].join('\u0000'),
  );
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const itemKey = key(value);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
}
