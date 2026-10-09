import type { PrivacyRepository, SearchRepository } from '@story-keeper/database';
import {
  searchFamilyStoryOutputSchema,
  type FamilyStorySearchResult,
  type SearchFamilyStoryOutput,
} from '@story-keeper/shared';

import { StoryKeeperError } from './errors.js';

const maximumQueryTokens = 24;
const maximumSnippetLength = 240;

export class SearchService {
  public constructor(
    private readonly privacy: PrivacyRepository,
    private readonly searchRepository: SearchRepository,
  ) {}

  public searchFamilyStory(
    familyId: string,
    actorPersonId: string,
    query: string,
    limit: number,
  ): SearchFamilyStoryOutput {
    if (this.privacy.findActor(familyId, actorPersonId) === undefined) {
      throw new StoryKeeperError(
        'ACTOR_NOT_AUTHORIZED',
        'The actor is not an active member of this family.',
      );
    }

    const matchQuery = normalizeSearchQuery(query);
    const results = this.searchRepository.search(familyId, matchQuery, limit).map(mapSearchResult);
    return searchFamilyStoryOutputSchema.parse({ results });
  }
}

export function normalizeSearchQuery(query: string): string {
  const tokens =
    query
      .normalize('NFKC')
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, maximumQueryTokens) ?? [];
  if (tokens.length === 0) {
    throw new StoryKeeperError(
      'SEARCH_QUERY_INVALID',
      'The search query must contain at least one letter or number.',
    );
  }
  return tokens.map((token) => `"${token}"`).join(' AND ');
}

function mapSearchResult(
  row: ReturnType<SearchRepository['search']>[number],
): FamilyStorySearchResult {
  const body = row.body.trim();
  const snippet =
    body.length <= maximumSnippetLength
      ? body
      : `${body.slice(0, maximumSnippetLength - 1).trimEnd()}…`;
  const date =
    row.datePrecision === null
      ? null
      : {
          earliestYear: row.earliestYear,
          latestYear: row.latestYear,
          precision: row.datePrecision,
        };
  return {
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    title: row.title,
    snippet,
    personId: row.personId,
    personDisplayName: row.personDisplayName,
    date,
    rank: row.rank,
  };
}
