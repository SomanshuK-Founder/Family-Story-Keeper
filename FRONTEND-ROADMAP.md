# FRONTEND-ROADMAP.md — Person B Execution Plan

## Source of truth
This roadmap follows the agreed Two-Person Hackathon Execution Plan. Person A backend is already complete through backend Phase 10; Person B phases still execute in the original order for interaction, UI, and demo obligations.

## Phase 0 — Project setup and rules lock
Create React/Vite apps for simulator, timeline, family tree, and chapter review. Build minimal Story Keeper shell with narrator selector, relative selector, and `+3 Days`. Establish test/build/typecheck/lint foundations and consume shared DTOs. No real MCP client yet.

Acceptance: pnpm install/dev work, all frontend apps build, tests run cleanly, backend remains clean, no Phase 1 behavior.

## Phase 1 — Real MCP client + browser persistence validation
Build a real MCP client in the simulator using initialize, tools/list, tools/call. No fake local business results. Connect start_interview, get_next_question, and save_answer.

Acceptance: browser starts interview -> real MCP call -> answer stored in SQLite -> refresh/reconnect -> state survives.

## Phase 2 — Story memory developer surfaces + basic timeline
Build temporary developer panels for narrator/session/facts/events/conflicts and a basic timeline renderer using real structured memory where available.

Acceptance: a real answer mentioning a person such as Raj produces visible structured pending memory/source linkage as exposed by backend.

## Phase 3 — Bedrock intelligence states
Add saved/processing/extraction-pending/complete/failed states, source drawer, pending badges, relationship cards, and timeline event cards.

Acceptance: natural answer asynchronously creates structured pending memory with provenance and UI communicates the state clearly.

## Phase 4 — Provenance + ambiguity UX
Surface provenance and ambiguity clearly. Never pretend unresolved identities are confirmed.

Acceptance: displayed narrator-visible pending memory can be traced to safe source metadata without leaking raw content to unauthorized roles.

## Phase 5 — Contradiction experience + smart questions
Build conflict experience showing earlier/new claims, gentle clarification wording, and only backend-supported resolution choices using `list_pending_conflicts`, `resolve_conflict`, and `get_next_question`.

Acceptance: demo reliably creates and resolves 1962 vs 1964 conflict.

## Phase 6 — Approval boundary + privacy UX
Build narrator memory approval cards with actions actually supported by backend; build chapter approval shell. Relative/child surfaces stay approved-only.

Acceptance: pending memory stays hidden from family-visible surfaces/search; approved representation becomes visible after approval.

## Phase 7 — Family question queue
Build Maya mode using real `queue_family_question`; later switch/jump to Rosa and surface the backend-planned queued question.

Acceptance: Maya question is persisted and returned to Rosa after intended `+3 Days` demo jump.

## Phase 8 — Chapter generation and review
Build narrator chapter review UI using `request_chapter_draft`, `review_chapter`, and `approve_story_item`. Show title, body, safe source metadata, source count/references, review state, and supported actions.

Acceptance: chapter moves through real generated/pending-review/reviewed/approved backend state; family-visible chapter surfaces show only approved chapters.

## Phase 9 — MCP Apps
Build actual MCP Apps: Timeline, Family Graph, Chapter Review, using official MCP Apps resources/skills. Simulator and MCP Apps must use identical shared Story Keeper schemas.

Acceptance: simulator and MCP Apps consume identical backend/shared data contracts.

## Phase 10 — Search presentation
Integrate `search_family_story` with query input, loading, empty state, bounded result list, approved snippets, source type, and safe metadata.

Acceptance: query like “What did Grandma say about the farm?” returns grounded approved results through the real tool.

## Phase 11 — Simulator polish
Remove admin-dashboard feel; make simulator Echo Show-like; include Rosa/Maya/+3 Days, voice input where reliable, typed fallback, polished loading states, contextual visual pane, and restrained transitions. Hide/remove developer panels from primary demo.

Acceptance: simulator looks like a product demo, not a debug console.

## Phase 12 — AWS deployment verification
Verify remote simulator/MCP App behavior, responsiveness, hosted URLs, and correct public endpoint configuration while local repo remains runnable.

Acceptance: hosted environment works and local environment still works.

## Phase 13 — Optional AWS Builder enhancement
Only if core is done. Add export UX only for a real valuable archive/export capability. Do not endanger core polish.

Acceptance: AWS feature contributes clear product value.

## Phase 14 — Full scenario testing
Focus UI glitches, voice fallback, responsiveness, transitions, demo timing, role switching, time jump, loading/error/empty states, conflict, approval, question queue, chapter, and search.

Acceptance: deterministic demo seed reproduces Rosa -> Raj -> Maya -> conflict -> chapter -> approval -> search without manual DB repair.

## Phase 15 — Documentation + feedback
Together with Person A, verify README, architecture, privacy, MCP compliance, demo docs, friction log, product feedback, and clean-environment setup.

Acceptance: a judge can clone, understand, run, and evaluate without team assistance.

## Phase 16 — Video + submission QA
Person B leads product demo: conversation, multi-session memory, Maya question, conflict, timeline, chapter, approval. No major new feature work on submission day.

Acceptance: final submission tested and complete before deadline.

## MVP cut line
Must have: real MCP server, persistent interview memory, Bedrock extraction, provenance, multi-session recall, queued family question, conflict detection, approval, timeline MCP App, simulator.

Optional if time is tight: family graph, chapter review MCP App, voice polish, FTS search presentation, S3 export, Polly, embeddings, advanced OAuth.
