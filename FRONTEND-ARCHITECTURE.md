# FRONTEND-ARCHITECTURE.md — Story Keeper Person B

## Objective
Person B builds the interaction and presentation layer while Person A's backend remains the authoritative source of truth.

## Target workspace
Person B frontend work lives under `apps/`:
```text
apps/
  simulator/
  timeline/
  family-tree/
  chapter-review/
```
A small `packages/ui/` is allowed only for genuinely shared frontend primitives/tokens.

## Technology baseline
Use React, TypeScript, Vite, pnpm workspace, Vitest, React Testing Library, and Playwright for selected browser/integration checks. Follow repository TypeScript/lint/format conventions. Do not introduce Next.js or another package manager.

## Responsibility boundaries
### Person A backend
Owns database, durable interview state, story memory, provenance, conflicts, approval/privacy, family question queue, chapter generation, search, MCP tool contracts, async workers, and Bedrock provider boundary.

### Person B frontend
Owns simulator, role/mode switching, time-jump controls, timeline, family tree, memory cards, conflict clarification UX, family-question UX, chapter review UX, search-result presentation, MCP Apps, typed/voice interaction surfaces, and demo flow.

## Allowed dependency direction
Allowed:
```text
apps/* -> packages/ui -> packages/shared -> MCP client -> MCP server
```
Forbidden:
```text
apps/* -> packages/database
apps/* -> database repositories
apps/* -> story-engine internals
apps/* -> Bedrock provider internals
```

## Shared contracts
Import frozen DTOs/schemas from `packages/shared/src/presentation.ts` and `packages/shared/src/search.ts`. Do not copy domain interfaces. Frontend-only view models may derive from shared DTOs inside features.

## State management
Default to React local state/context. Do not add Redux/Zustand/XState/MobX unless a later concrete need proves necessary.

## Feature organization
Prefer feature-focused code under `src/app`, `src/components`, `src/features`, `src/lib`, `src/mocks`, `src/styles`, and `src/test`, adapted sensibly to the four-app structure.

## Simulator
Eventually provides Rosa/narrator mode, Maya/relative mode, `+3 Days`, conversation pane, visual pane, typed fallback, optional voice controls, and live MCP calls. It must never become an alternate canonical backend.

## Timeline
Consumes `TimelineResponse`, preserves identity and exact/approximate/range/unknown date semantics, and never exposes raw answers.

## Family tree
Consumes `FamilyGraphResponse`. Render only backend-confirmed nodes and approved relationship edges. Never infer missing genealogy.

## Chapters
Family-visible reading uses approved chapter DTOs. Narrator-private review uses the dedicated review contract. Do not mix pending drafts into approved chapter lists.

## Search
Search UI consumes frozen search DTOs. Do not implement browser FTS, direct DB queries, or hidden/private reranking.

## MCP client
Real MCP client integration begins in Person B Phase 1 using initialize, tools/list, and tools/call through the official SDK and existing endpoint.

## MCP Apps
Actual MCP Apps are Person B Phase 9. Simulator and MCP Apps must consume the same shared DTOs.

## Voice
Voice is presentation/input only and must map to the same underlying actions as typed fallback. It must degrade gracefully.

## Styling
Use shared tokens/primitives where useful; avoid a large design system. Cover typography, spacing, surfaces, focus states, radius, elevation, restrained motion, and semantic status.

## Errors
Distinguish validation, authorization/privacy, not found, state conflict, processing, provider unavailable, no results, and generic unexpected failure. Never expose stack traces, SQL, filesystem paths, or private data.

## Environment
Frontend env vars may contain only public configuration. Never place AWS keys, secret tokens, private keys, or backend secrets in frontend env.

## Integration gap rule
If frontend seems to need a backend change: prove the gap, prefer safe frontend derivation, prefer additive optional changes, and never redesign backend behavior inside a frontend phase without explicit integration approval.
