# Story Keeper MCP Server

Story Keeper exposes MCP `2025-11-25` over Streamable HTTP at `POST /mcp`.

The transport is stateless. Durable interview identity and progress are stored in SQLite and use
`interviewId`; MCP transport sessions are never the product source of truth.

## Tools

### `start_interview`

Input: `familyId`, `personId`.

Returns the durable interview ID, narrator ID/display name, and current question ID/text.

### `save_answer`

Input: `familyId`, `interviewId`, `questionId`, `rawText`.

Persists the raw text unchanged and returns `{ answerId, status: "saved" }`.

### `get_next_question`

Input: `familyId`, `interviewId`.

Returns one stable shape. While questions remain, `status` is `question` and question fields are
strings. After any current unanswered question, the deterministic planner prioritizes
narrator-relevant contradictions, queued family questions, and memory clarifications before the
fallback interview bank. When no question remains, `status` is `complete` and both question fields
are `null`.

### `list_pending_conflicts`

Input: `familyId`, `interviewId`.

Returns unresolved, source-backed fact or timeline contradictions scoped to the interview narrator.

### `resolve_conflict`

Input: `familyId`, `interviewId`, `contradictionId`, `resolutionType`.

Records `keep_left`, `keep_right`, `different_events`, or `dismiss_not_a_conflict` with resolver and
timestamp metadata. Resolution preserves source answers and does not approve the surviving claim.

### `get_story_context`

Input: `familyId`, `actorPersonId`.

Returns narrator-review context for narrators and approved family-visible context for relatives and
children. It does not return raw answers.

### `approve_story_item`

Input: `familyId`, `actorPersonId`, `targetType`, `targetId`, `action`.

Applies an explicit, provenance-checked `approve`, `reject`, or `revoke` transition to an eligible
fact, relationship, timeline event, or narrator-owned chapter draft.

### `delete_pending_memory`

Input: `familyId`, `actorPersonId`, `targetType`, `targetId`.

Invalidates eligible pending derived memory while preserving source evidence and audit metadata.

### `queue_family_question`

Input: `familyId`, `fromPersonId`, `toPersonId`, `questionText`.

Lets an active relative or child queue a private, bounded question for an active narrator in the
same family. It returns the stable queued-question ID and `queued` status.

### `request_chapter_draft`

Input: `familyId`, `actorPersonId`, `narratorPersonId`, `chapterTopic`.

Lets an active narrator queue an asynchronous chapter draft for their own story when at least two
approved narrator-scoped sources exist. Phase 7 treats the bounded topic as writing intent and uses
all eligible sources in deterministic order; it does not claim semantic search or include hidden or
pending evidence.

### `review_chapter`

Input: `familyId`, `actorPersonId`, `chapterDraftId`.

Returns a narrator-owned chapter draft and its safe structured source metadata. Raw answers are not
returned; relatives and children cannot review private drafts.

### `get_timeline`

Input: `familyId`, `actorPersonId`.

Returns approved family-visible timeline events. Known dates sort chronologically; unknown dates
sort last. Approximate and range dates retain both year bounds and their original precision.

```json
{
  "items": [
    {
      "id": "a6cc9724-a0a7-4c07-91e7-bf4694587d98",
      "eventType": "move",
      "title": "Moved to Delhi",
      "description": "The family moved to Delhi.",
      "personId": "be9e1b1b-4132-4ed0-a2a0-6fb89fc0dd86",
      "personDisplayName": "Rosa",
      "date": {
        "earliestYear": 1962,
        "latestYear": 1964,
        "precision": "approximate"
      },
      "status": "approved",
      "sourceCount": 1
    }
  ]
}
```

### `get_family_graph`

Input: `familyId`, `actorPersonId`.

Returns `nodes` and `edges` derived only from approved relationships. Nodes use persisted person
IDs; unresolved person candidates never appear as confirmed nodes.

```json
{
  "nodes": [],
  "edges": []
}
```

### `get_approved_chapters`

Input: `familyId`, `actorPersonId`.

Returns approved chapter cards with narrator identity, approval time, and source count. Pending and
rejected drafts and raw source answers are never returned.

```json
{
  "chapters": [
    {
      "chapterId": "34e036bc-c9ae-425c-b2df-5aa8bb2c2020",
      "title": "A Delhi Childhood",
      "body": "Rosa remembered the move to Delhi.",
      "narratorPersonId": "be9e1b1b-4132-4ed0-a2a0-6fb89fc0dd86",
      "narratorDisplayName": "Rosa",
      "approvedAt": "2026-01-02T00:00:00.000Z",
      "sourceCount": 2
    }
  ]
}
```

### `search_family_story`

Input: `familyId`, `actorPersonId`, `query`, with optional `limit` (default 10, maximum 25).

Searches approved family-visible facts, resolved-identity relationships, timeline events, and
chapters through SQLite FTS5. The query is treated as natural-language terms rather than raw FTS
syntax. Results never contain raw answers, pending memory, private drafts, unresolved conflicts,
queued questions, or person candidates.

```json
{
  "results": [
    {
      "sourceType": "timeline_event",
      "sourceId": "a6cc9724-a0a7-4c07-91e7-bf4694587d98",
      "title": "Moved to Delhi",
      "snippet": "move Moved to Delhi The family moved to Delhi.",
      "personId": "be9e1b1b-4132-4ed0-a2a0-6fb89fc0dd86",
      "personDisplayName": "Rosa",
      "date": {
        "earliestYear": 1962,
        "latestYear": 1964,
        "precision": "approximate"
      },
      "rank": -0.8
    }
  ]
}
```

## Frontend contract boundary

The exact presentation schemas and TypeScript types live in
`packages/shared/src/presentation.ts`; the Phase 9 search contract lives in
`packages/shared/src/search.ts`. The presentation reads and search are approved-only for narrators,
relatives, and children; narrator-private review continues through `get_story_context` and
`review_chapter`. All 15 MCP tool names and their existing required fields are frozen. Coordinate
breaking changes with Person B and prefer additive optional fields.

## Local demo seed

Run `pnpm db:seed` to create the fictional `Story Keeper Demo Family` and narrator `Rosa`. The
command prints their deterministic IDs and is safe to run repeatedly.
