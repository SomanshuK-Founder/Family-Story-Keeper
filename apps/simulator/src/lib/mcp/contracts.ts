import { maximumRawAnswerLength } from '@story-keeper/shared';
import { z } from 'zod';

const opaqueIdSchema = z.uuid();

export const startInterviewInputSchema = z.object({
  familyId: opaqueIdSchema,
  personId: opaqueIdSchema,
});

export const startInterviewResultSchema = z.object({
  interviewId: opaqueIdSchema,
  narrator: z.object({
    id: opaqueIdSchema,
    displayName: z.string(),
  }),
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

export type StartInterviewInput = z.infer<typeof startInterviewInputSchema>;
export type StartInterviewResult = z.infer<typeof startInterviewResultSchema>;
export type GetNextQuestionInput = z.infer<typeof getNextQuestionInputSchema>;
export type GetNextQuestionResult = z.infer<typeof getNextQuestionResultSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerInputSchema>;
export type SaveAnswerResult = z.infer<typeof saveAnswerResultSchema>;
