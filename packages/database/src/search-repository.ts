import type { DatePrecision, SearchSourceType } from '@story-keeper/shared';

import type { StoryKeeperDatabase } from './database.js';

export interface SearchDocumentRecord {
  readonly sourceType: SearchSourceType;
  readonly sourceId: string;
  readonly title: string;
  readonly body: string;
  readonly personId: string | null;
  readonly personDisplayName: string | null;
  readonly earliestYear: number | null;
  readonly latestYear: number | null;
  readonly datePrecision: DatePrecision | null;
  readonly rank: number;
}

export interface SearchRepository {
  search(familyId: string, matchQuery: string, limit: number): readonly SearchDocumentRecord[];
  rebuild(): number;
  count(): number;
}

interface SearchRow {
  readonly source_type: SearchSourceType;
  readonly source_id: string;
  readonly title: string;
  readonly body: string;
  readonly person_id: string | null;
  readonly person_display_name: string | null;
  readonly earliest_year: number | null;
  readonly latest_year: number | null;
  readonly date_precision: DatePrecision | null;
  readonly rank: number;
}

export class SqliteSearchRepository implements SearchRepository {
  public constructor(private readonly database: StoryKeeperDatabase) {}

  public search(
    familyId: string,
    matchQuery: string,
    limit: number,
  ): readonly SearchDocumentRecord[] {
    const rows = this.database.client
      .prepare(SEARCH_SQL)
      .all({ familyId, limit, matchQuery }) as SearchRow[];
    return rows.map((row) => ({
      sourceType: row.source_type,
      sourceId: row.source_id,
      title: row.title,
      body: row.body,
      personId: row.person_id,
      personDisplayName: row.person_display_name,
      earliestYear: row.earliest_year,
      latestYear: row.latest_year,
      datePrecision: row.date_precision,
      rank: row.rank,
    }));
  }

  public rebuild(): number {
    return this.database.client.transaction(() => {
      this.database.client.prepare('DELETE FROM story_search').run();
      for (const statement of REBUILD_INSERTS) this.database.client.prepare(statement).run();
      return this.count();
    })();
  }

  public count(): number {
    const row = this.database.client
      .prepare('SELECT count(*) AS count FROM story_search')
      .get() as { readonly count: number };
    return row.count;
  }
}

const ELIGIBLE_SOURCE = `
  (s.source_type = 'fact' AND EXISTS (
    SELECT 1 FROM facts f
    WHERE f.family_id = s.family_id AND f.id = s.source_id AND f.approval_status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM contradictions c
        WHERE c.family_id = f.family_id AND c.status = 'unresolved'
          AND c.contradiction_type = 'fact_value'
          AND (c.left_fact_id = f.id OR c.right_fact_id = f.id)
      )
  )) OR
  (s.source_type = 'relationship' AND EXISTS (
    SELECT 1 FROM relationships r
    WHERE r.family_id = s.family_id AND r.id = s.source_id AND r.approval_status = 'approved'
      AND EXISTS (SELECT 1 FROM people fp WHERE fp.family_id = r.family_id AND fp.id = r.from_person_id AND fp.status = 'active')
      AND EXISTS (SELECT 1 FROM people tp WHERE tp.family_id = r.family_id AND tp.id = r.to_person_id AND tp.status = 'active')
      AND NOT EXISTS (
        SELECT 1 FROM person_candidates pc
        WHERE pc.family_id = r.family_id
          AND pc.status = 'unresolved'
          AND pc.candidate_person_id IN (r.from_person_id, r.to_person_id)
      )
  )) OR
  (s.source_type = 'timeline_event' AND EXISTS (
    SELECT 1 FROM timeline_events e
    WHERE e.family_id = s.family_id AND e.id = s.source_id AND e.approval_status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM contradictions c
        WHERE c.family_id = e.family_id AND c.status = 'unresolved'
          AND c.contradiction_type = 'timeline_date'
          AND (c.left_timeline_event_id = e.id OR c.right_timeline_event_id = e.id)
      )
  )) OR
  (s.source_type = 'chapter' AND EXISTS (
    SELECT 1 FROM chapter_drafts d
    WHERE d.family_id = s.family_id AND d.id = s.source_id AND d.status = 'approved'
  ))`;

const SEARCH_SQL = `
  SELECT s.source_type, s.source_id, s.title, s.body, s.person_id,
    s.person_display_name, s.earliest_year, s.latest_year, s.date_precision,
    bm25(story_search) AS rank
  FROM story_search s
  WHERE story_search MATCH @matchQuery
    AND s.family_id = @familyId
    AND (${ELIGIBLE_SOURCE})
  ORDER BY rank ASC, s.source_type ASC, s.source_id ASC
  LIMIT @limit`;

const REBUILD_INSERTS = [
  `INSERT INTO story_search (family_id, source_type, source_id, person_id, person_display_name, title, body, earliest_year, latest_year, date_precision)
   SELECT f.family_id, 'fact', f.id, f.subject_person_id, p.canonical_display_name,
     replace(f.fact_type, '_', ' '), replace(f.fact_type, '_', ' ') || ' ' || f.normalized_value,
     NULL, NULL, NULL
   FROM facts f JOIN people p ON p.family_id = f.family_id AND p.id = f.subject_person_id
   WHERE f.approval_status = 'approved'
     AND NOT EXISTS (SELECT 1 FROM contradictions c WHERE c.family_id = f.family_id AND c.status = 'unresolved' AND c.contradiction_type = 'fact_value' AND (c.left_fact_id = f.id OR c.right_fact_id = f.id))`,
  `INSERT INTO story_search (family_id, source_type, source_id, person_id, person_display_name, title, body, earliest_year, latest_year, date_precision)
   SELECT r.family_id, 'relationship', r.id, r.from_person_id, fp.canonical_display_name,
     fp.canonical_display_name || ' — ' || replace(r.relationship_type, '_', ' ') || ' — ' || tp.canonical_display_name,
     fp.canonical_display_name || ' ' || replace(r.relationship_type, '_', ' ') || ' ' || tp.canonical_display_name,
     NULL, NULL, NULL
   FROM relationships r
   JOIN people fp ON fp.family_id = r.family_id AND fp.id = r.from_person_id
   JOIN people tp ON tp.family_id = r.family_id AND tp.id = r.to_person_id
   WHERE r.approval_status = 'approved' AND fp.status = 'active' AND tp.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM person_candidates pc WHERE pc.family_id = r.family_id AND pc.status = 'unresolved' AND pc.candidate_person_id IN (r.from_person_id, r.to_person_id))`,
  `INSERT INTO story_search (family_id, source_type, source_id, person_id, person_display_name, title, body, earliest_year, latest_year, date_precision)
   SELECT e.family_id, 'timeline_event', e.id, e.subject_person_id, p.canonical_display_name,
     e.title, replace(e.event_type, '_', ' ') || ' ' || e.title || ' ' || e.description,
     e.earliest_year, e.latest_year, e.date_precision
   FROM timeline_events e JOIN people p ON p.family_id = e.family_id AND p.id = e.subject_person_id
   WHERE e.approval_status = 'approved'
     AND NOT EXISTS (SELECT 1 FROM contradictions c WHERE c.family_id = e.family_id AND c.status = 'unresolved' AND c.contradiction_type = 'timeline_date' AND (c.left_timeline_event_id = e.id OR c.right_timeline_event_id = e.id))`,
  `INSERT INTO story_search (family_id, source_type, source_id, person_id, person_display_name, title, body, earliest_year, latest_year, date_precision)
   SELECT d.family_id, 'chapter', d.id, d.narrator_person_id, p.canonical_display_name,
     d.title, d.body, NULL, NULL, NULL
   FROM chapter_drafts d JOIN people p ON p.family_id = d.family_id AND p.id = d.narrator_person_id
   WHERE d.status = 'approved' AND d.title IS NOT NULL AND d.body IS NOT NULL`,
] as const;
