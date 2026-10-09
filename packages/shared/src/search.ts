import { z } from 'zod';

import { approximateDateSchema } from './story-memory.js';

// Frontend-facing Phase 9 contract: coordinate breaking changes with Person B;
// prefer additive optional fields for future evolution.

export const searchSourceTypes = ['fact', 'relationship', 'timeline_event', 'chapter'] as const;
export const searchSourceTypeSchema = z.enum(searchSourceTypes);
export type SearchSourceType = z.infer<typeof searchSourceTypeSchema>;

export const searchFamilyStoryInputSchema = z
  .object({
    familyId: z.uuid(),
    actorPersonId: z.uuid(),
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(25).default(10),
  })
  .strict();
export type SearchFamilyStoryInput = z.infer<typeof searchFamilyStoryInputSchema>;

export const familyStorySearchResultSchema = z
  .object({
    sourceType: searchSourceTypeSchema,
    sourceId: z.uuid(),
    title: z.string().min(1).max(300),
    snippet: z.string().max(300),
    personId: z.uuid().nullable(),
    personDisplayName: z.string().min(1).max(200).nullable(),
    date: approximateDateSchema.nullable(),
    rank: z.number(),
  })
  .strict();
export type FamilyStorySearchResult = z.infer<typeof familyStorySearchResultSchema>;

export const searchFamilyStoryOutputSchema = z
  .object({
    results: z.array(familyStorySearchResultSchema).max(25),
  })
  .strict();
export type SearchFamilyStoryOutput = z.infer<typeof searchFamilyStoryOutputSchema>;
