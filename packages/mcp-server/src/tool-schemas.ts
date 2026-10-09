import { z } from 'zod';

import { approximateDateSchema, contradictionResolutionTypeSchema } from '@story-keeper/shared';

const opaqueId = z.uuid();

export const startInterviewInputSchema = z.object({
  familyId: opaqueId,
  personId: opaqueId,
});

export const startInterviewOutputSchema = z.object({
  interviewId: opaqueId,
  narrator: z.object({
    id: opaqueId,
    displayName: z.string(),
  }),
  questionId: opaqueId,
  questionText: z.string(),
});

export const saveAnswerInputSchema = z.object({
  familyId: opaqueId,
  interviewId: opaqueId,
  questionId: opaqueId,
  rawText: z
    .string()
    .refine((value) => value.trim().length > 0, { message: 'rawText must not be empty' }),
});

export const saveAnswerOutputSchema = z.object({
  answerId: opaqueId,
  status: z.literal('saved'),
});

export const getNextQuestionInputSchema = z.object({
  familyId: opaqueId,
  interviewId: opaqueId,
});

export const getNextQuestionOutputSchema = z.object({
  status: z.enum(['question', 'complete']),
  interviewId: opaqueId,
  questionId: opaqueId.nullable(),
  questionText: z.string().nullable(),
});

export const listPendingConflictsInputSchema = z.object({
  familyId: opaqueId,
  interviewId: opaqueId,
});

const sourceAnswerIdsSchema = z.array(opaqueId);
const publicConflictClaimSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fact'),
    itemId: opaqueId,
    factType: z.string(),
    value: z.string(),
    status: z.enum(['pending', 'approved', 'rejected']),
    sourceAnswerIds: sourceAnswerIdsSchema,
  }),
  z.object({
    kind: z.literal('timeline_event'),
    itemId: opaqueId,
    eventType: z.string(),
    title: z.string(),
    description: z.string(),
    date: approximateDateSchema,
    status: z.enum(['pending', 'approved', 'rejected']),
    sourceAnswerIds: sourceAnswerIdsSchema,
  }),
]);

export const listPendingConflictsOutputSchema = z.object({
  conflicts: z.array(
    z.object({
      contradictionId: opaqueId,
      contradictionType: z.enum(['fact_value', 'timeline_date']),
      status: z.literal('unresolved'),
      left: publicConflictClaimSchema,
      right: publicConflictClaimSchema,
      suggestedQuestion: z.string(),
    }),
  ),
});

export const resolveConflictInputSchema = z.object({
  familyId: opaqueId,
  interviewId: opaqueId,
  contradictionId: opaqueId,
  resolutionType: contradictionResolutionTypeSchema,
});

export const resolveConflictOutputSchema = z.object({
  contradictionId: opaqueId,
  status: z.enum(['resolved', 'dismissed', 'already_resolved']),
  resolutionType: contradictionResolutionTypeSchema,
  resolvedByPersonId: opaqueId,
  resolvedAt: z.iso.datetime(),
});
