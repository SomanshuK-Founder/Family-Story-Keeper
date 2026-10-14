interface ProvenanceDisclosureProps {
  readonly sourceCount: number;
}

export function ProvenanceDisclosure({ sourceCount }: ProvenanceDisclosureProps) {
  return (
    <details className="provenance-disclosure">
      <summary>Source details</summary>
      <p>
        From Rosa’s interview · {sourceCount} interview {sourceCount === 1 ? 'source' : 'sources'}
      </p>
    </details>
  );
}
