# FRONTEND-TESTING.md — Person B Quality Contract

## Purpose
Testing must prove Person B surfaces correctly consume backend contracts, preserve privacy semantics, remain accessible/responsive, and are demo-safe. Compilation alone is insufficient.

## Tooling
Prefer Vitest, React Testing Library, jsdom where needed, and Playwright for selected browser/integration checks. Use repository-pinned versions when available.

## Required checks
Per phase, use appropriate lint, typecheck, unit tests, component tests, build, formatting, browser smoke, backend regression, and `git diff --check`.

## Phase 0
Verify simulator shell, narrator selector, relative selector, `+3 Days`, timeline fixture/schema, date semantics, family graph fixture, chapter shell, all four Vite builds, and backend regression.

## Phase 1 real MCP client
Verify initialize, protocol negotiation, exact tools/list, tools/call, malformed input handling, reconnect, and browser refresh durability. Main integration test must use real MCP server rather than a fake.

## Interview
Verify start interview, current question, answer submit/save, processing state, refreshed backend truth, and safe duplicate-submit behavior.

## Async processing
Distinguish saved, processing, completed, failed/retryable. Do not imply extraction is instant.

## Provenance
Verify safe metadata only, no raw answer leakage to unauthorized views, no raw IDs as primary UX, and correct source metadata where provided.

## Conflicts
Verify earlier/new claims, non-accusatory language, only supported choices, stale/already-resolved handling, and deterministic 1962-vs-1964 fixture.

## Privacy
Create representative pending/private content and verify relative/child cannot see it through story context, timeline, family graph, approved chapters, search, or cached simulator state. After approval, only intended approved representation appears.

## Identity
Verify unresolved candidates never appear as confirmed nodes, are never silently merged, and never produce confirmed edges.

## Family questions
Verify Maya uses real queue tool, persistence is backend-owned, narrator/time-jump flow can surface it, role restrictions work, and UX controls duplicate submission where practical.

## Chapters
Verify async request state, narrator-private pending draft, bounded source metadata, real approval update, family visibility only after approval, and pending/rejected hidden.

## Timeline
Verify approved events, exact/approximate/range/unknown semantics, deterministic order, and empty state.

## Family tree
Verify unique nodes, valid edges, approved relationships only, unresolved candidates absent, responsive readability, and no console errors.

## Search
Verify normal query, empty input, loading, zero results, approved result, type display, bounded snippet, punctuation/unicode, and absence of private/pending results.

## Responsive
At minimum check 1440x900 and about 820x900 simulator/Echo-like viewport. Add more only when deployment needs them.

## Accessibility
Check keyboard traversal, visible focus, labels, semantic controls, no hover-only critical action, meaningful button names, headings/landmarks, and status announcements where useful. Automated tools may supplement but not replace manual checks.

## Browser console
Primary demo flows must have no uncaught exceptions, React key warnings, failed asset loads, repeated network-error loops, or secret/private logging.

## Backend regression
Person B must not break Person A. Full workspace checks should preserve exactly 15 tools, protocol compatibility, backend tests, and no new frontend-driven migration.

## Snapshots
Avoid large brittle snapshots. Prefer semantic assertions. Small targeted snapshots are allowed only when clearly useful.

## Mock policy
Mocks are fine for isolated components/loading/error states, but cannot replace required real MCP coverage after the relevant integration phase.

## Full demo scenario
By scenario-testing phase, reproducibly verify Rosa session -> answer -> pending memory -> conflict -> approval -> Maya question -> +3 Days -> Rosa receives question -> chapter -> chapter approval -> timeline -> search, without direct DB editing.

## Phase completion checklist
Run:
```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
git diff --check
```
plus phase-specific Playwright/integration checks.

Confirm no later-phase leakage, no unexpected backend change, no tracked runtime/private artifacts, and browser smoke passes where relevant.
