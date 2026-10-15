import type { StoryContextPersonIdentity } from '@story-keeper/shared';

interface PersonIdentityStatusProps {
  readonly identity: StoryContextPersonIdentity | undefined;
}

export function PersonIdentityStatus({ identity }: PersonIdentityStatusProps) {
  if (identity === undefined) {
    return (
      <p className="identity-status" data-status="unavailable">
        <span>Identity details unavailable</span>
      </p>
    );
  }

  if (identity.status === 'confirmed') {
    return (
      <p className="identity-status" data-status="confirmed">
        <span>Confirmed person</span>
        <strong>{identity.displayName}</strong>
      </p>
    );
  }

  return (
    <p className="identity-status" data-status="unresolved">
      <span>Identity needs clarification</span>
      <strong>{identity.extractedDisplayName}</strong>
    </p>
  );
}

export function identityDisplayName(
  identity: StoryContextPersonIdentity | undefined,
): string | null {
  if (identity === undefined) return null;
  return identity.status === 'confirmed' ? identity.displayName : identity.extractedDisplayName;
}
