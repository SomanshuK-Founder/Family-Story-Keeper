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

Persists non-empty raw text unchanged up to 20,000 characters and returns
`{ answerId, status: "saved" }`.

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

Run `pnpm db:seed` to create the fictional `Story Keeper Demo Family`, narrator `Rosa`, relative
`Maya`, and child `Arun`. The command prints their deterministic IDs and is safe to run repeatedly.
It creates actors only; story memory still flows through the real interview, worker, approval, and
chapter paths.

## Clean-clone runbook

Requirements: Node.js 24 LTS and Corepack. From the repository root:

```text
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The server listens on `HTTP_HOST`/`PORT` (by default `127.0.0.1:3000`), serves liveness at
`GET /health`, and MCP at `POST /mcp`. A non-loopback `HTTP_HOST` requires an explicit
`HTTP_ALLOWED_HOSTS` comma-separated allowlist. `HTTP_ALLOWED_ORIGINS` is optional; when configured,
browser requests with other origins are rejected while originless MCP clients remain valid.

The extraction and chapter providers default to `disabled`, so ordinary local work never contacts
AWS. When either provider is deliberately set to `bedrock`, set `AWS_REGION` and
`BEDROCK_MODEL_ID`; credentials come from the standard AWS provider chain. The worker is part of
the backend process and does not require a second command. `SIGINT` and `SIGTERM` stop polling,
await the active poll, close HTTP, and then close SQLite. A process killed during a job leaves a
recoverable stale lock.

Verified local commands:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
pnpm search:rebuild
pnpm demo:smoke
pnpm test:performance
```

`pnpm demo:smoke` uses mock extraction and chapter providers to exercise the complete local backend
journey and restart recovery without AWS. `pnpm test:performance` records sample count, p50, p95,
and maximum local latency for health, MCP tool listing, interview, answer, planner, presentation,
and search paths; it is observational and has no environment-sensitive timing assertion.

## Demo recovery

- **Port in use:** change `PORT`, or stop the process already listening on it.
- **SQLite missing:** run `pnpm db:migrate` and `pnpm db:seed`; parent directories are created.
- **SQLite appears corrupt:** preserve the file for diagnosis, restore a known copy, rerun migrations,
  then run `pnpm search:rebuild`. The FTS index is derived; raw answers and story tables are not.
- **Migrations not applied:** run `pnpm db:migrate`. Existing migrations are append-only.
- **Stale worker lock:** restart after `WORKER_LOCK_TIMEOUT_MS`; startup returns expired locks to the
  bounded queue or marks exhausted work failed.
- **Provider disabled:** queued AI work remains durable. Use `pnpm demo:smoke` for the mock path, or
  explicitly configure Bedrock when a live call is intended.
- **Bedrock enabled without credentials/config:** startup rejects missing region/model configuration;
  standard AWS credential resolution reports missing credentials without printing secrets.
- **Search results missing:** run `pnpm search:rebuild`; rebuild is transactional and idempotent and
  indexes only currently approved, eligible memory.
