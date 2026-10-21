# Family Story Keeper

Family Story Keeper is an implemented local release candidate for the Alexa+ track of the Amazon
Developer Hackathon.

## Product
Family Story Keeper is a voice-first assistant that interviews relatives over short sessions and turns approved memories into a family timeline and written chapters.

Core trust rule:

**AI can assist family history; it cannot silently become the authority over family history.**

## Project documentation
These documents define the shared architecture and release contracts.

Read in order:
1. `AGENTS.md`
2. `PROJECT.md`
3. `DECISIONS.md`
4. `BACKEND-ARCHITECTURE.md`
5. `MCP-COMPLIANCE.md`
6. `DATABASE.md`
7. `BEDROCK.md`
8. `PRIVACY.md`
9. `TESTING.md`
10. `CODING-STANDARDS.md`
11. `BACKEND-ROADMAP.md`

Living docs:
- `FRICTION-LOG.md`
- `PRODUCT-FEEDBACK.md`

## Stack
- Node.js 24 LTS
- TypeScript
- pnpm
- MCP Streamable HTTP
- Alexa+ compatibility target: MCP 2025-11-25
- SQLite
- Drizzle
- Amazon Bedrock Converse API
- SQLite-backed jobs
- Vitest
- SQLite FTS5

## Status
Person A backend Phases 0–10 and Person B frontend/integration Phases 0–9 are complete and frozen.
Person B Phase 10 is the current hardening release candidate. MCP Apps, production voice,
deployment, and later-phase product work are not implemented.

See `FRONTEND-INTEGRATION.md` for the local four-app runbook and
`packages/mcp-server/README.md` for the backend/tool contract and recovery runbook.

## Core Invariants
- product state is database-backed
- `save_answer` stays fast
- slow model work is asynchronous
- AI-derived historical claims have provenance
- ambiguous people are not silently merged
- approximate dates stay approximate
- contradictions are resolved, not overwritten
- pending memory differs from approved family history
- family-visible search defaults to approved content
- demo uses real MCP + real database state
