# Family Story Keeper — Backend

Pre-implementation backend specification for the Alexa+ track of the Amazon Developer Hackathon.

## Product
Family Story Keeper is a voice-first assistant that interviews relatives over short sessions and turns approved memories into a family timeline and written chapters.

Core trust rule:

**AI can assist family history; it cannot silently become the authority over family history.**

## Person A Context
This documentation is prepared before backend implementation so Codex and the human developer share one architecture.

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

## Planned Backend Stack
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
**Documentation complete. Implementation has not started.**

Do not begin Phase 0 until explicitly requested.

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
