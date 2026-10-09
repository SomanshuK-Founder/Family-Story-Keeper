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
strings. The deterministic planner prioritizes narrator-relevant contradictions and clarifications
before the fallback interview bank. When no question remains, `status` is `complete` and both
question fields are `null`.

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
fact, relationship, or timeline event.

### `delete_pending_memory`

Input: `familyId`, `actorPersonId`, `targetType`, `targetId`.

Invalidates eligible pending derived memory while preserving source evidence and audit metadata.

## Local demo seed

Run `pnpm db:seed` to create the fictional `Story Keeper Demo Family` and narrator `Rosa`. The
command prints their deterministic IDs and is safe to run repeatedly.
