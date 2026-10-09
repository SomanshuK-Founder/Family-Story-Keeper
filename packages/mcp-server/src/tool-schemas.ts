import { z } from 'zod';

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
