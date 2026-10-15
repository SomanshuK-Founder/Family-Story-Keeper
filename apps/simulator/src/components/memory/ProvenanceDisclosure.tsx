interface ProvenanceDisclosureProps {
  readonly sourceCount: number;
  readonly itemLabel: string;
  readonly itemType: 'fact' | 'relationship' | 'timeline memory';
}

export function ProvenanceDisclosure({
  sourceCount,
  itemLabel,
  itemType,
}: ProvenanceDisclosureProps) {
  return (
    <details className="provenance-disclosure">
      <summary aria-label={`Source details for ${itemLabel}`}>Source details</summary>
      <div className="provenance-content">
        <p>
          {sourceCount === 0
            ? 'No interview sources are currently listed.'
            : `Supported by ${String(sourceCount)} interview ${sourceCount === 1 ? 'source' : 'sources'}.`}
        </p>
        <p>Story item: {humanize(itemType)}</p>
      </div>
    </details>
  );
}

function humanize(value: string): string {
  return value.replace(/^./, (letter) => letter.toUpperCase());
}
