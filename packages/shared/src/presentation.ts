import { z } from 'zod';

import { approximateDateSchema, relationshipTypeSchema } from './story-memory.js';

const opaqueIdSchema = z.uuid();

/**
 * Phase 8 frontend-facing contracts. Breaking changes require coordination with Person B;
 * prefer additive optional fields when these contracts need to grow.
 */
export const presentationReadInputSchema = z
  .object({
    familyId: opaqueIdSchema,
    actorPersonId: opaqueIdSchema,
  })
  .strict();
export type PresentationReadInput = z.infer<typeof presentationReadInputSchema>;

export const timelineItemSchema = z
  .object({
    id: opaqueIdSchema,
    eventType: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    personId: opaqueIdSchema,
    personDisplayName: z.string().min(1),
    date: approximateDateSchema,
    status: z.literal('approved'),
    sourceCount: z.number().int().nonnegative(),
  })
  .strict();
export type TimelineItem = z.infer<typeof timelineItemSchema>;

export const timelineResponseSchema = z
  .object({
    items: z.array(timelineItemSchema),
  })
  .strict();
export type TimelineResponse = z.infer<typeof timelineResponseSchema>;

export const familyGraphNodeSchema = z
  .object({
    personId: opaqueIdSchema,
    displayName: z.string().min(1),
    role: z.enum(['narrator', 'relative', 'child']).nullable(),
    status: z.enum(['active', 'inactive']),
  })
  .strict();
export type FamilyGraphNode = z.infer<typeof familyGraphNodeSchema>;

export const familyGraphEdgeSchema = z
  .object({
    relationshipId: opaqueIdSchema,
    fromPersonId: opaqueIdSchema,
    toPersonId: opaqueIdSchema,
    relationshipType: relationshipTypeSchema,
    status: z.literal('approved'),
    sourceCount: z.number().int().nonnegative(),
  })
  .strict();
export type FamilyGraphEdge = z.infer<typeof familyGraphEdgeSchema>;

export const familyGraphResponseSchema = z
  .object({
    nodes: z.array(familyGraphNodeSchema),
    edges: z.array(familyGraphEdgeSchema),
  })
  .strict();
export type FamilyGraphResponse = z.infer<typeof familyGraphResponseSchema>;

export const approvedChapterSummarySchema = z
  .object({
    chapterId: opaqueIdSchema,
    title: z.string().min(1),
    body: z.string().min(1),
    narratorPersonId: opaqueIdSchema,
    narratorDisplayName: z.string().min(1),
    approvedAt: z.iso.datetime(),
    sourceCount: z.number().int().positive(),
  })
  .strict();
export type ApprovedChapterSummary = z.infer<typeof approvedChapterSummarySchema>;

export const approvedChaptersResponseSchema = z
  .object({
    chapters: z.array(approvedChapterSummarySchema),
  })
  .strict();
export type ApprovedChaptersResponse = z.infer<typeof approvedChaptersResponseSchema>;
