import type { StoryKeeperDatabase } from './database.js';
import { families, familyMemberships, people } from './schema.js';

export const demoSeedIds = {
  familyId: '00000000-0000-4000-8000-000000000001',
  rosaPersonId: '00000000-0000-4000-8000-000000000002',
  rosaMembershipId: '00000000-0000-4000-8000-000000000003',
} as const;

export function seedDemoData(database: StoryKeeperDatabase): typeof demoSeedIds {
  const now = new Date();

  database.db.transaction((transaction) => {
    transaction
      .insert(families)
      .values({
        id: demoSeedIds.familyId,
        displayName: 'Story Keeper Demo Family',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: families.id,
        set: { displayName: 'Story Keeper Demo Family', updatedAt: now },
      })
      .run();

    transaction
      .insert(people)
      .values({
        id: demoSeedIds.rosaPersonId,
        familyId: demoSeedIds.familyId,
        canonicalDisplayName: 'Rosa',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: people.id,
        set: {
          familyId: demoSeedIds.familyId,
          canonicalDisplayName: 'Rosa',
          status: 'active',
          updatedAt: now,
        },
      })
      .run();

    transaction
      .insert(familyMemberships)
      .values({
        id: demoSeedIds.rosaMembershipId,
        familyId: demoSeedIds.familyId,
        personId: demoSeedIds.rosaPersonId,
        role: 'narrator',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: familyMemberships.id,
        set: { role: 'narrator', status: 'active', updatedAt: now },
      })
      .run();
  });

  return demoSeedIds;
}
