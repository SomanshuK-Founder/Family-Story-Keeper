# BACKEND-ROADMAP.md — Person A Phases

## Rule
This is a roadmap, not permission to implement all phases.

Codex must work only on the phase explicitly requested by the human.

## Phase 0 — Backend Foundation
Status: **Not started**

When explicitly authorized later:
- Node 24 / TypeScript foundation
- pnpm backend packages
- MCP foundation
- SQLite/Drizzle foundation
- test/lint/typecheck foundation
- health endpoint

Acceptance:
- install works
- server starts
- DB initializes
- checks run

**Do not implement Phase 0 until explicitly asked.**

## Phase 1 — Real MCP + Durable Interview Persistence
Goals:
- Streamable HTTP MCP
- target protocol compatibility
- interview persistence

Initial tools:
- `start_interview`
- `save_answer`
- `get_next_question`

Acceptance:
- real MCP client/server flow
- answer persists
- reconnect does not lose history

## Phase 2 — Story Memory Engine
Goals:
- facts
- provenance
- people
- relationships
- timeline
- approximate dates
- contradiction schema

Acceptance:
A narrator answer can create persisted pending candidates linked to source evidence.

## Phase 3 — Bedrock Extraction Pipeline
Goals:
- jobs worker
- Converse adapter
- structured extraction
- schema validation
- deterministic normalization
- provenance

Acceptance:
Answer saves quickly and extraction finishes asynchronously.

## Phase 4 — Contradictions + Question Planning
Goals:
- conflict candidates
- conflict listing
- resolution
- next-question priority

Acceptance:
Conflicting years produce a resolvable conflict rather than overwrite.

## Phase 5 — Approval + Privacy Boundary
Goals:
- pending/approved/rejected
- approvals
- family-visible filtering
- basic deletion
- role scoping

Acceptance:
Pending Rosa memory is hidden from Maya; after approval it becomes visible.

## Phase 6 — Family Question Queue
Goals:
- persisted queue
- from/to people
- lifecycle
- next-question integration

Acceptance:
Maya's database-backed question can surface in Rosa's later interview.

## Phase 7 — Chapter Generation Backend
Goals:
- grounded source selection
- generation job
- draft persistence
- source links
- review retrieval
- approval

Acceptance:
Chapter remains pending until approved and is grounded in selected sources.

## Phase 8 — MCP Apps Backend Support
Person B owns UI.

Backend:
- freeze tool schemas
- provide timeline data
- provide graph data
- provide chapter review data

Acceptance:
Same backend data drives simulator and MCP App surfaces.

## Phase 9 — Approved Story Search
Goals:
- FTS5
- approved-only index
- `search_family_story`

Acceptance:
Approved content is searchable; pending/rejected is excluded by default.

## Phase 10 — Hardening
Goals:
- latency measurement
- duplicate/idempotency behavior
- worker recovery
- Bedrock failure handling
- privacy tests
- MCP compatibility tests
- logging redaction

Acceptance:
Critical end-to-end scenario passes repeatedly.

## Phase 11 — Deployment Support
Goals:
- deployment/container config when needed
- AWS Bedrock config
- safe secrets
- persistent storage
- budget awareness

Acceptance:
Backend remains locally reproducible and can run in chosen AWS environment.

## Phase 12 — Optional AWS Builder Enhancements
Only after core Alexa+ backend is complete.

Possible:
- S3 archive export
- other meaningful AWS integration

No decorative AWS services.

## Feature Freeze
Once demo scenario is reliable:
- no major architecture change
- no new infrastructure
- no speculative feature

Focus on bugs, tests, privacy, reliability, docs.
