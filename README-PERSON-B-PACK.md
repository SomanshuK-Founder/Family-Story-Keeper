# Family Story Keeper — Person B Markdown Pack

## Purpose
This pack defines the complete working contract for Person B's scope in the Family Story Keeper Alexa+ hackathon project.

Person A's backend is complete through Phase 10, audited, tagged, and frozen. Person B owns the interaction and presentation side: simulator, MCP Apps, voice UX, timeline visual, family tree, chapter review UI, demo flow, frontend testing, and integration validation.

Place every file in this pack in the repository root. Do not replace or delete the existing backend Markdown files.

## Files
- `FRONTEND-AGENTS.md` — binding operating rules for Codex while working as Person B.
- `FRONTEND-ARCHITECTURE.md` — workspace structure, boundaries, ownership, and allowed dependencies.
- `FRONTEND-ROADMAP.md` — Person B execution plan from Phase 0 through Phase 16.
- `FRONTEND-DESIGN.md` — visual, UX, accessibility, and interaction principles.
- `FRONTEND-INTEGRATION.md` — frozen backend contracts, MCP tool surface, DTO usage, and integration rules.
- `FRONTEND-TESTING.md` — required frontend, MCP, privacy, responsive, and regression checks.

## Mandatory use
Before every Person B Codex phase, instruct Codex to read:
- `AGENTS.md`
- `FRONTEND-AGENTS.md`
- `FRONTEND-ARCHITECTURE.md`
- `FRONTEND-ROADMAP.md`
- `FRONTEND-DESIGN.md`
- `FRONTEND-INTEGRATION.md`
- `FRONTEND-TESTING.md`
- relevant existing backend contracts

## Frozen backend rule
Do not casually modify `packages/database`, `packages/story-engine`, `packages/bedrock`, migrations, worker semantics, approval/privacy semantics, identity-resolution semantics, search semantics, or existing MCP request/response schemas.

Exactly 15 public MCP tools are part of the frozen backend contract.

## Git tags
Use separate Person B tags:
`person-b-phase-0-complete` through `person-b-phase-16-complete`.

## Current status
Person B Phase 0 has already been implemented once and currently reports PASS. Add these files before freezing that phase, then run a reconciliation audit against this contract pack.
