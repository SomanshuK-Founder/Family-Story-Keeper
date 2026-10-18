import {
  approximateDateSchema,
  contradictionResolutionTypeSchema,
  maximumRawAnswerLength,
  presentationReadInputSchema,
  relationshipTypeSchema,
  storyItemStatusSchema,
  storyContextPersonIdentitySchema,
  timelineResponseSchema,
} from '@story-keeper/shared';
import { z } from 'zod';

const opaqueIdSchema = z.uuid();

export const startInterviewInputSchema = z.object({
  familyId: opaqueIdSchema,
  personId: opaqueIdSchema,
});

export const startInterviewResultSchema = z.object({
  interviewId: opaqueIdSchema,
  narrator: z.object({ id: opaqueIdSchema, displayName: z.string() }),
  questionId: opaqueIdSchema,
  questionText: z.string(),
});

export const getNextQuestionInputSchema = z.object({
  familyId: opaqueIdSchema,
  interviewId: opaqueIdSchema,
});

export const getNextQuestionResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('question'),
    interviewId: opaqueIdSchema,
    questionId: opaqueIdSchema,
    questionText: z.string(),
  }),
  z.object({
    status: z.literal('complete'),
    interviewId: opaqueIdSchema,
    questionId: z.null(),
    questionText: z.null(),
  }),
]);

export const saveAnswerInputSchema = z.object({
  familyId: opaqueIdSchema,
  interviewId: opaqueIdSchema,
  questionId: opaqueIdSchema,
  rawText: z
    .string()
    .max(maximumRawAnswerLength)
    .refine((value) => value.trim().length > 0),
});

export const saveAnswerResultSchema = z.object({
  answerId: opaqueIdSchema,
  status: z.literal('saved'),
});

export const getStoryContextInputSchema = z.object({
  familyId: opaqueIdSchema,
  actorPersonId: opaqueIdSchema,
});

const contextItemBaseSchema = z.object({
  id: opaqueIdSchema,
  status: z.enum(['pending', 'approved']),
  sourceCount: z.number().int().nonnegative(),
});

export const getStoryContextResultSchema = z.object({
  actor: z.object({
    id: opaqueIdSchema,
    displayName: z.string(),
    role: z.enum(['narrator', 'relative', 'child']),
  }),
  visibility: z.enum(['narrator_review', 'approved_family']),
  personIdentities: z.array(storyContextPersonIdentitySchema).optional(),
  facts: z.array(
    contextItemBaseSchema.extend({
      subjectPersonId: opaqueIdSchema,
      factType: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  relationships: z.array(
    contextItemBaseSchema.extend({
      fromPersonId: opaqueIdSchema,
      toPersonId: opaqueIdSchema,
      relationshipType: relationshipTypeSchema,
      confidence: z.number().min(0).max(1),
    }),
  ),
  timelineEvents: z.array(
    contextItemBaseSchema.extend({
      subjectPersonId: opaqueIdSchema,
      eventType: z.string(),
      title: z.string(),
      description: z.string(),
      date: approximateDateSchema,
    }),
  ),
  chapters: z.array(
    z.object({
      id: opaqueIdSchema,
      narratorPersonId: opaqueIdSchema,
      title: z.string(),
      body: z.string(),
      status: z.literal('approved'),
      sourceCount: z.number().int().positive(),
    }),
  ),
  conflicts: z.array(
    z.object({
      contradictionId: opaqueIdSchema,
      contradictionType: z.enum(['fact_value', 'timeline_date']),
      status: z.literal('unresolved'),
    }),
  ),
});

export const listPendingConflictsInputSchema = z.object({
  familyId: opaqueIdSchema,
  interviewId: opaqueIdSchema,
});

const conflictClaimSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fact'),
    itemId: opaqueIdSchema,
    factType: z.string(),
    value: z.string(),
    status: storyItemStatusSchema,
    sourceAnswerIds: z.array(opaqueIdSchema),
  }),
  z.object({
    kind: z.literal('timeline_event'),
    itemId: opaqueIdSchema,
    eventType: z.string(),
    title: z.string(),
    description: z.string(),
    date: approximateDateSchema,
    status: storyItemStatusSchema,
    sourceAnswerIds: z.array(opaqueIdSchema),
  }),
]);

export const listPendingConflictsResultSchema = z.object({
  conflicts: z.array(
    z.object({
      contradictionId: opaqueIdSchema,
      contradictionType: z.enum(['fact_value', 'timeline_date']),
      status: z.literal('unresolved'),
      left: conflictClaimSchema,
      right: conflictClaimSchema,
      suggestedQuestion: z.string(),
    }),
  ),
});

export const resolveConflictInputSchema = z.object({
  familyId: opaqueIdSchema,
  interviewId: opaqueIdSchema,
  contradictionId: opaqueIdSchema,
  resolutionType: contradictionResolutionTypeSchema,
});

export const resolveConflictResultSchema = z.object({
  contradictionId: opaqueIdSchema,
  status: z.enum(['resolved', 'dismissed', 'already_resolved']),
  resolutionType: contradictionResolutionTypeSchema,
  resolvedByPersonId: opaqueIdSchema,
  resolvedAt: z.iso.datetime(),
});

export { presentationReadInputSchema, timelineResponseSchema };

export type StartInterviewInput = z.infer<typeof startInterviewInputSchema>;
export type StartInterviewResult = z.infer<typeof startInterviewResultSchema>;
export type GetNextQuestionInput = z.infer<typeof getNextQuestionInputSchema>;
export type GetNextQuestionResult = z.infer<typeof getNextQuestionResultSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerInputSchema>;
export type SaveAnswerResult = z.infer<typeof saveAnswerResultSchema>;
export type GetStoryContextInput = z.infer<typeof getStoryContextInputSchema>;
export type GetStoryContextResult = z.infer<typeof getStoryContextResultSchema>;
export type ListPendingConflictsInput = z.infer<typeof listPendingConflictsInputSchema>;
export type ListPendingConflictsResult = z.infer<typeof listPendingConflictsResultSchema>;
export type ResolveConflictInput = z.infer<typeof resolveConflictInputSchema>;
export type ResolveConflictResult = z.infer<typeof resolveConflictResultSchema>;
