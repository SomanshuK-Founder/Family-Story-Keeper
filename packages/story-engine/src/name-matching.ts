export type NameMatchClassification = 'exact' | 'possible' | 'unlikely';

export interface NameCandidate {
  readonly id: string;
  readonly name: string;
}

export interface NameMatchResult {
  readonly left: NameCandidate;
  readonly right: NameCandidate;
  readonly score: number;
  readonly classification: NameMatchClassification;
}

const possibleMatchThreshold = 0.6;

export function scoreNameMatch(left: NameCandidate, right: NameCandidate): NameMatchResult {
  const leftNormalized = normalizeName(left.name);
  const rightNormalized = normalizeName(right.name);
  const score = diceCoefficient(leftNormalized, rightNormalized);

  return {
    left,
    right,
    score,
    classification:
      score === 1 ? 'exact' : score >= possibleMatchThreshold ? 'possible' : 'unlikely',
  };
}

function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) return left.length === 0 ? 0 : 1;
  if (left.length < 2 || right.length < 2) return 0;

  const leftPairs = toPairCounts(left);
  const rightPairs = toPairCounts(right);
  let intersection = 0;

  for (const [pair, leftCount] of leftPairs) {
    intersection += Math.min(leftCount, rightPairs.get(pair) ?? 0);
  }

  return (2 * intersection) / (left.length - 1 + right.length - 1);
}

function toPairCounts(value: string): ReadonlyMap<string, number> {
  const pairs = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const pair = value.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  return pairs;
}
