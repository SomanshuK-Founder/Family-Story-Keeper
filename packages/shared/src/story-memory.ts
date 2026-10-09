import { z } from 'zod';

export const storyItemStatuses = ['pending', 'approved', 'rejected'] as const;
export const storyItemStatusSchema = z.enum(storyItemStatuses);
export type StoryItemStatus = z.infer<typeof storyItemStatusSchema>;

export const relationshipTypes = [
  'sibling',
  'spouse',
  'parent',
  'child',
  'cousin',
  'friend',
] as const;
export const relationshipTypeSchema = z.enum(relationshipTypes);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const datePrecisions = ['exact', 'approximate', 'range', 'unknown'] as const;
export const datePrecisionSchema = z.enum(datePrecisions);
export type DatePrecision = z.infer<typeof datePrecisionSchema>;

export const approximateDateSchema = z
  .object({
    earliestYear: z.number().int().nullable(),
    latestYear: z.number().int().nullable(),
    precision: datePrecisionSchema,
  })
  .superRefine((date, context) => {
    if (date.precision === 'unknown') {
      if (date.earliestYear !== null || date.latestYear !== null) {
        context.addIssue({
          code: 'custom',
          message: 'Unknown dates must not include year bounds.',
        });
      }
      return;
    }

    if (date.earliestYear === null || date.latestYear === null) {
      context.addIssue({
        code: 'custom',
        message: 'Known dates require both year bounds.',
      });
      return;
    }

    if (date.earliestYear > date.latestYear) {
      context.addIssue({
        code: 'custom',
        message: 'The earliest year must not be later than the latest year.',
      });
    }

    if (date.precision === 'exact' && date.earliestYear !== date.latestYear) {
      context.addIssue({
        code: 'custom',
        message: 'Exact dates must use the same earliest and latest year.',
      });
    }
  });

export type ApproximateDate = z.infer<typeof approximateDateSchema>;

export const contradictionTypes = ['fact_value', 'timeline_date'] as const;
export const contradictionTypeSchema = z.enum(contradictionTypes);
export type ContradictionType = z.infer<typeof contradictionTypeSchema>;

export const contradictionStatuses = ['unresolved', 'resolved', 'dismissed'] as const;
export const contradictionStatusSchema = z.enum(contradictionStatuses);
export type ContradictionStatus = z.infer<typeof contradictionStatusSchema>;
