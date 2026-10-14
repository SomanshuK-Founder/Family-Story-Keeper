import {
  approvedChaptersResponseSchema,
  type ApprovedChaptersResponse,
} from '@story-keeper/shared';

export const approvedChaptersFixture: ApprovedChaptersResponse =
  approvedChaptersResponseSchema.parse({
    chapters: [
      {
        chapterId: '4a000000-0000-4000-8000-000000000001',
        title: 'The House on Marigold Lane',
        body: 'Rosa remembered a close neighborhood, the people who looked out for one another, and the small rituals that made the street feel like home.',
        narratorPersonId: '2a000000-0000-4000-8000-000000000001',
        narratorDisplayName: 'Rosa',
        approvedAt: '2026-01-02T00:00:00.000Z',
        sourceCount: 3,
      },
    ],
  });
