# AGENTS.md — Story Keeper Backend Rules for Codex

## Purpose
This is the primary instruction contract for any AI coding agent working on the Story Keeper backend.

Read this file first, then:
1. `PROJECT.md`
2. `DECISIONS.md`
3. `BACKEND-ARCHITECTURE.md`
4. `MCP-COMPLIANCE.md`
5. `DATABASE.md`
6. `BEDROCK.md`
7. `PRIVACY.md`
8. `TESTING.md`
9. `CODING-STANDARDS.md`
10. `BACKEND-ROADMAP.md`

`FRICTION-LOG.md` and `PRODUCT-FEEDBACK.md` are living documents and must contain only real observations.

## Person A Scope
Person A owns backend work:
- MCP server
- database/repositories
- story-memory engine
- Bedrock integration
- background jobs
- entity/relationship logic
- contradiction logic
- approval/visibility rules
- family-question queue
- chapter-generation backend
- approved-story search
- backend tests and deployment support

Frontend/simulator/MCP App UI belongs primarily to Person B.

## Product Principle
Story Keeper may extract, organize, suggest, draft, and ask.

It may not silently turn an AI inference into family history.

Important facts, relationships, events, and chapters remain pending until approved.

## Non-Negotiable Technical Principles
1. Alexa+ compatibility target: MCP `2025-11-25` over Streamable HTTP.
2. Use current official TypeScript MCP tooling while explicitly preserving Alexa+ compatibility.
3. Durable interview state belongs in the database, not in MCP transport session memory.
4. `save_answer` must remain fast; slow LLM work belongs in background jobs.
5. Bedrock output must be schema-validated before domain use.
6. Every AI-derived historical claim must retain provenance to source answers.
7. Fuzzy matching may create person candidates but must never silently merge ambiguous people.
8. Contradictions create resolvable candidates; do not overwrite history automatically.
9. Family-visible search defaults to approved content only.
10. Do not add infrastructure merely because it is common in production systems.

## Allowed Without Asking
Codex may:
- implement only the explicitly requested current backend phase
- add tests required by that phase
- add small internal utilities needed by that phase
- add migrations required by that phase
- improve typing, validation, logging, or error handling within this design
- update documentation when behavior actually changes

## Must Ask Before Changing
Codex must ask before:
- replacing SQLite
- adding Redis, Kafka, RabbitMQ, SQS, Temporal, etc.
- introducing microservices
- adding a vector database
- adding GraphQL
- changing MCP protocol target or transport
- renaming frozen MCP tools
- changing approval/visibility semantics
- changing role semantics
- conceptually redesigning the source-of-truth schema
- adding an AWS service outside the current phase
- changing Person B's frontend architecture

## Forbidden Behaviors
Do not:
- invent product requirements
- fabricate Amazon requirements
- claim tests passed unless they were run
- silently swallow invalid model output
- auto-correct conflicting family history
- fabricate exact dates from approximate memories
- log raw story text by default
- expose pending memories in family-visible search
- hardcode a fake demo path that bypasses real MCP/database behavior
- implement later phases while current acceptance criteria are failing
- create production-scale complexity before it is needed

## Change Discipline
For each backend task:
1. Read relevant Markdown contracts.
2. State what files will change and why.
3. Implement the smallest coherent change.
4. Add/update tests.
5. Run required checks.
6. Report what changed, what was verified, and known limitations.
7. Update friction/feedback files only with genuine experience.

## Definition of Done
A backend task is complete only when:
- code type-checks
- relevant tests pass
- repository boundaries are respected
- errors are handled
- no secret is committed
- behavior matches these contracts
- public tool/schema changes are documented

## Authority
Newest explicit human instruction wins over this file.

If repository Markdown files conflict, stop and ask rather than choosing silently.
