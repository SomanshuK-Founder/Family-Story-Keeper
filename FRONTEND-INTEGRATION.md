# FRONTEND-INTEGRATION.md — Person B ↔ Person A Contract

## Purpose
Defines how Person B frontend/simulator/MCP Apps integrate with frozen Person A backend. Backend owns truth; frontend owns presentation.

## MCP
Use the existing Streamable HTTP MCP endpoint and protocol compatibility target `2025-11-25`. Use the official SDK. Do not invent a separate REST business API.

## Frozen tools
Interview: `start_interview`, `save_answer`, `get_next_question`.
Conflicts: `list_pending_conflicts`, `resolve_conflict`.
Context/approval: `get_story_context`, `approve_story_item`, `delete_pending_memory`.
Family queue: `queue_family_question`.
Chapters: `request_chapter_draft`, `review_chapter`.
Presentation: `get_timeline`, `get_family_graph`, `get_approved_chapters`.
Search: `search_family_story`.

## Shared schemas
Consume frontend-safe contracts from `packages/shared/src/presentation.ts` and `packages/shared/src/search.ts` through the package boundary.

## Roles
Primary demo roles are narrator Rosa and relative/child Maya. UI must not infer permissions; backend responses/errors are authoritative.

## Privacy
Narrator may receive more private review/pending context through narrator-scoped tools. Relative/child family surfaces remain approved-only. Never reveal pending content because it is cached client-side.

## Reconnect
Durable state lives in SQLite/backend. On refresh: reconnect MCP client, initialize, re-query relevant state. Do not treat browser memory as canonical.

## Async extraction
After `save_answer`: immediate success -> extraction runs asynchronously -> UI refetches/polls relevant state. Do not block waiting for Bedrock.

## Async chapter generation
After `request_chapter_draft`: request accepted -> worker generates -> narrator retrieves/reviews later. Do not fake instant chapters when connected to real backend.

## Conflicts
Frontend presents gentle wording and maps user choice only to supported backend resolution modes. Handle stale/already-resolved conflicts gracefully.

## Family questions
Maya mode must use real `queue_family_question`; do not keep questions only in browser state once Phase 7 is reached.

## Presentation
Timeline: preserve backend date semantics.
Family graph: render only returned nodes/edges; never synthesize links.
Chapters: family list uses approved chapters; narrator review uses review contract.
Search: use `search_family_story`; never query SQLite or duplicate FTS in browser.

## Errors
Map backend errors to safe UI states: unauthorized, validation, state conflict, provider unavailable, no result, generic unexpected. Keep technical details out of user UI.

## MCP Apps
Person B Phase 9 owns actual MCP Apps. They must use the same shared contracts as simulator UI.

## Backend change rule
If a genuine gap is found: document the failing journey, prove existing contract cannot safely satisfy it, propose the smallest additive change, run all backend regression tests, and preserve all required fields.

## Integration acceptance
Correct integration means real MCP initialize works, tools/list returns exactly 15 tools, tool calls use existing schemas, state survives refresh through backend durability, privacy boundary is respected, no direct DB access exists in frontend, and no fake business data remains where real MCP is required.
