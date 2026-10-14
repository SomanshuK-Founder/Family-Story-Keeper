import { familyGraphResponseSchema, type FamilyGraphResponse } from '@story-keeper/shared';

export const familyGraphFixture: FamilyGraphResponse = familyGraphResponseSchema.parse({
  nodes: [
    {
      personId: '2a000000-0000-4000-8000-000000000001',
      displayName: 'Rosa',
      role: 'narrator',
      status: 'active',
    },
    {
      personId: '2a000000-0000-4000-8000-000000000002',
      displayName: 'Maya',
      role: 'relative',
      status: 'active',
    },
    {
      personId: '2a000000-0000-4000-8000-000000000003',
      displayName: 'Arun',
      role: 'child',
      status: 'active',
    },
  ],
  edges: [
    {
      relationshipId: '3a000000-0000-4000-8000-000000000001',
      fromPersonId: '2a000000-0000-4000-8000-000000000001',
      toPersonId: '2a000000-0000-4000-8000-000000000002',
      relationshipType: 'parent',
      status: 'approved',
      sourceCount: 2,
    },
    {
      relationshipId: '3a000000-0000-4000-8000-000000000002',
      fromPersonId: '2a000000-0000-4000-8000-000000000002',
      toPersonId: '2a000000-0000-4000-8000-000000000003',
      relationshipType: 'parent',
      status: 'approved',
      sourceCount: 1,
    },
  ],
});
