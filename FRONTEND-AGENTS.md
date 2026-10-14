# FRONTEND-AGENTS.md — Story Keeper Person B Rules

## Purpose
Primary instruction contract for any AI coding agent working on Person B's portion of Family Story Keeper.

Person A owns truth and state. Person B owns interaction and presentation.

Read this file before Person B implementation work, together with `AGENTS.md`, `PROJECT.md`, `DECISIONS.md`, `PRIVACY.md`, `MCP-COMPLIANCE.md`, `TESTING.md`, `CODING-STANDARDS.md`, and the other `FRONTEND-*.md` files.

## Person B ownership
Person B owns simulator, MCP Apps, voice UX, timeline visual, family-tree visual, chapter-review UI, search-result presentation, frontend accessibility, responsive behavior, demo interaction design, frontend tests, and frontend integration verification.

Person B supports MCP integration, shared schema review, documentation, end-to-end scenario testing, deployment verification, and submission QA.

## Frozen Person A backend
Treat the backend as frozen unless a later integration audit proves a concrete blocking defect.

Do not modify without explicit justification:
- `packages/database`
- `packages/story-engine`
- `packages/bedrock`
- database migrations
- extraction/chapter worker semantics
- approval/privacy rules
- conflict-resolution rules
- identity-resolution rules
- search semantics
- persistence rules
- existing MCP tool contracts

## Frozen MCP surface
Exactly 15 public tools exist:
1. `start_interview`
2. `save_answer`
3. `get_next_question`
4. `list_pending_conflicts`
5. `resolve_conflict`
6. `get_story_context`
7. `approve_story_item`
8. `delete_pending_memory`
9. `queue_family_question`
10. `request_chapter_draft`
11. `review_chapter`
12. `get_timeline`
13. `get_family_graph`
14. `get_approved_chapters`
15. `search_family_story`

Do not rename, remove, or silently change these contracts.

## Shared contract sources
Frontend code must consume existing exported types/schemas, primarily:
- `packages/shared/src/presentation.ts`
- `packages/shared/src/search.ts`

Do not duplicate domain interfaces in frontend code.

## Architecture rule
Frontend/simulator may communicate with Story Keeper through real MCP client calls, shared DTOs/schemas, and documented mocks before real integration is introduced.

Never query SQLite directly, import database repositories into UI code, call story-engine internals directly, mutate backend tables, bypass approval/privacy, or fabricate backend state once the phase requires real MCP results.

## Phase discipline
Implement only the requested Person B phase. Do not prepare ahead.

At the end of every phase run frontend-focused tests, full lint, typecheck, tests, build, formatting, `git diff --check`, verify all 15 MCP tools remain, verify Person A backend tests remain green, and inspect the diff for later-phase leakage.

## Mocking rule
Mocks are allowed only where the current phase permits them. Once a roadmap phase requires real MCP interaction, do not keep fake local business results for that feature. Unit-test mocks remain allowed.

## Privacy rule
Never expose in family-visible UI: pending/rejected memory, unresolved contradictions, unresolved identity candidates, queued-question private state, raw answers, pending/rejected chapter drafts, or private provider prompts/responses.

## Identity rule
Never infer identity equality from matching names. Never promote unresolved candidates into confirmed family members.

## Date rule
Preserve exact, approximate, range, and unknown date semantics. Never fabricate precision.

## Accessibility rule
Interactive surfaces must support keyboard use, visible focus, semantic controls, readable contrast, sufficiently large targets, and no hover-only critical action.

## Design rule
Story Keeper must feel like a warm family-memory product, not an admin dashboard. Prefer narrative hierarchy, human names, calm states, large readable text, clear provenance, gentle conflict wording, and restrained motion.

Avoid raw IDs, dense final debug tables, technical job-state language, and excessive visual chrome.

## Testing rule
Do not declare PASS merely because the app compiles. Verify render behavior, contract compatibility, accessibility baseline, responsive behavior, loading/empty/error states, backend regression safety, and absence of browser console errors.

## Secrets
Never ship AWS credentials, private tokens, private keys, backend secrets, or raw provider configuration. Only public frontend configuration may use `VITE_*`.

## Dependency rule
Do not add libraries merely because they are popular. Every dependency must solve a concrete phase requirement.

## Completion rule
A phase is complete only after implementation, focused audit, required fixes, full validation, commit, and dedicated Person B phase tag.
