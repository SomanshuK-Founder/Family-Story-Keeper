# Story Keeper MCP Server

Phase 1 exposes MCP `2025-11-25` over Streamable HTTP at `POST /mcp`.

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
strings. When the Phase 1 bank is exhausted, `status` is `complete` and both question fields are
`null`.

## Local demo seed

Run `pnpm db:seed` to create the fictional `Story Keeper Demo Family` and narrator `Rosa`. The
command prints their deterministic IDs and is safe to run repeatedly.
