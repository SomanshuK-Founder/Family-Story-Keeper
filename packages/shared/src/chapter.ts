import { z } from 'zod';

export const chapterSourceTypes = ['fact', 'relationship', 'timeline_event'] as const;
export const chapterSourceTypeSchema = z.enum(chapterSourceTypes);
export type ChapterSourceType = z.infer<typeof chapterSourceTypeSchema>;

export const chapterDraftStatuses = [
  'generating',
  'pending_review',
  'approved',
  'rejected',
  'failed',
  'superseded',
] as const;
export const chapterDraftStatusSchema = z.enum(chapterDraftStatuses);
export type ChapterDraftStatus = z.infer<typeof chapterDraftStatusSchema>;

export const chapterSourceReferenceSchema = z
  .object({
    type: chapterSourceTypeSchema,
    id: z.uuid(),
  })
  .strict();
export type ChapterSourceReference = z.infer<typeof chapterSourceReferenceSchema>;

export const draftChapterJobPayloadSchema = z
  .object({
    chapterDraftId: z.uuid(),
    sources: z.array(chapterSourceReferenceSchema).min(2).max(100),
  })
  .strict();
export type DraftChapterJobPayload = z.infer<typeof draftChapterJobPayloadSchema>;

export const chapterGenerationSourceSchema = chapterSourceReferenceSchema
  .extend({
    label: z.string().trim().min(1).max(300),
    content: z.string().trim().min(1).max(2_000),
  })
  .strict();
export type ChapterGenerationSource = z.infer<typeof chapterGenerationSourceSchema>;

export const chapterGenerationRequestSchema = z
  .object({
    chapterDraftId: z.uuid(),
    topic: z.string().trim().min(1).max(200),
    narrator: z
      .object({
        id: z.uuid(),
        displayName: z.string().trim().min(1).max(200),
      })
      .strict(),
    sources: z.array(chapterGenerationSourceSchema).min(2).max(100),
  })
  .strict();
export type ChapterGenerationRequest = z.infer<typeof chapterGenerationRequestSchema>;

export const generatedChapterSourceSchema = chapterSourceReferenceSchema;

export const chapterGenerationSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10_000),
    usedSources: z.array(generatedChapterSourceSchema).min(1).max(100),
  })
  .strict()
  .superRefine((chapter, context) => {
    const keys = chapter.usedSources.map((source) => `${source.type}:${source.id}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Chapter source references must be unique.' });
    }
  });
export type ChapterGeneration = z.infer<typeof chapterGenerationSchema>;

export const chapterGenerationJsonSchema = z.toJSONSchema(chapterGenerationSchema, {
  target: 'draft-2020-12',
});
