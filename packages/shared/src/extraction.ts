import { z } from 'zod';

import { approximateDateSchema, relationshipTypeSchema } from './story-memory.js';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const referenceSchema = z.string().regex(/^[A-Za-z0-9:_-]{1,100}$/);
const confidenceSchema = z.number().min(0).max(1);

export const extractedPersonSchema = z
  .object({
    reference: referenceSchema,
    displayName: boundedText(200),
    confidence: confidenceSchema,
  })
  .strict();

export const extractedRelationshipSchema = z
  .object({
    fromReference: referenceSchema,
    toReference: referenceSchema,
    relationshipType: relationshipTypeSchema,
    confidence: confidenceSchema,
  })
  .strict();

export const extractedEventSchema = z
  .object({
    subjectReference: referenceSchema,
    eventType: boundedText(100),
    title: boundedText(300),
    description: z.string().trim().max(2_000),
    date: approximateDateSchema,
    confidence: confidenceSchema,
  })
  .strict();

export const extractedPlaceSchema = z
  .object({
    name: boundedText(300),
    relatedPersonReference: referenceSchema.nullable(),
    confidence: confidenceSchema,
  })
  .strict();

export const extractedDateMentionSchema = z
  .object({
    sourceText: boundedText(300),
    date: approximateDateSchema,
  })
  .strict();

export const extractedFactCandidateSchema = z
  .object({
    subjectReference: referenceSchema,
    factType: boundedText(100),
    normalizedValue: boundedText(1_000),
    confidence: confidenceSchema,
    sourceLocator: z.string().trim().min(1).max(300).nullable(),
  })
  .strict();

export const extractedFollowUpCandidateSchema = z
  .object({
    question: boundedText(500),
    reason: boundedText(500),
  })
  .strict();

export const storyExtractionSchema = z
  .object({
    people: z.array(extractedPersonSchema).max(20),
    relationships: z.array(extractedRelationshipSchema).max(30),
    events: z.array(extractedEventSchema).max(30),
    places: z.array(extractedPlaceSchema).max(30),
    dateMentions: z.array(extractedDateMentionSchema).max(30),
    factCandidates: z.array(extractedFactCandidateSchema).max(50),
    followUpCandidates: z.array(extractedFollowUpCandidateSchema).max(20),
  })
  .strict();

export const storyExtractionJsonSchema = z.toJSONSchema(storyExtractionSchema, {
  target: 'draft-2020-12',
});

export type StoryExtraction = z.infer<typeof storyExtractionSchema>;

export const extractAnswerJobPayloadSchema = z.object({ answerId: z.uuid() }).strict();
export type ExtractAnswerJobPayload = z.infer<typeof extractAnswerJobPayloadSchema>;

export interface StoryExtractionKnownPerson {
  readonly reference: string;
  readonly id: string;
  readonly displayName: string;
}

export interface StoryExtractionRequest {
  readonly answerId: string;
  readonly rawAnswer: string;
  readonly narrator: StoryExtractionKnownPerson;
  readonly question: {
    readonly id: string;
    readonly text: string;
  };
  readonly knownPeople: readonly StoryExtractionKnownPerson[];
}
