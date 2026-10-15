import type { StoryContextPersonIdentity } from '@story-keeper/shared';

interface IdentityClarificationListProps {
  readonly identities: readonly StoryContextPersonIdentity[];
  readonly highlightedIds: ReadonlySet<string>;
}

export function IdentityClarificationList({
  identities,
  highlightedIds,
}: IdentityClarificationListProps) {
  const unresolvedIdentities = identities.filter((identity) => identity.status === 'unresolved');
  if (unresolvedIdentities.length === 0) return null;

  return (
    <section className="identity-clarification" aria-labelledby="identity-clarification-title">
      <div className="identity-clarification-heading">
        <div>
          <p className="panel-label">People to clarify</p>
          <h3 id="identity-clarification-title">Needs clarification</h3>
        </div>
        <span>{unresolvedIdentities.length} unresolved</span>
      </div>
      <p className="identity-clarification-intro">
        Story Keeper keeps these person references separate until the family clarifies them.
      </p>
      <div className="identity-clarification-grid">
        {unresolvedIdentities.map((identity) => (
          <article
            className="ambiguity-card"
            data-new={highlightedIds.has(identity.personId) || undefined}
            key={identity.personId}
          >
            <p className="memory-state">Person needs clarification</p>
            <h4>{identity.extractedDisplayName}</h4>
            <p>Story Keeper has not linked this person automatically.</p>
            {identity.possibleMatchDisplayName === null ? (
              <p>
                <strong>No confirmed match has been selected.</strong> This person reference remains
                unresolved.
              </p>
            ) : (
              <div className="possible-match">
                <span>Possible person</span>
                <strong>{identity.possibleMatchDisplayName}</strong>
                <p>This person reference remains unresolved.</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
