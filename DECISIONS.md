# DECISIONS.md — Locked Backend Decisions

## D-001 Language
TypeScript.

## D-002 Runtime
Node.js 24 LTS.

## D-003 Alexa+ MCP Target
MCP `2025-11-25` over Streamable HTTP.

The current TypeScript SDK may support newer protocol eras, but the Alexa+ compatibility path must explicitly support/test 2025-11-25 behavior.

Do not silently change the wire-protocol contract.

## D-004 Durable Product State
Interview/product state lives in SQLite.

MCP transport sessions are not the source of truth.

## D-005 Database
SQLite + Drizzle + migrations + repository layer.

## D-006 Search
SQLite FTS5 first.

Embeddings/vector search are deferred until proven necessary.

## D-007 Jobs
SQLite-backed jobs table + worker loop.

No Redis/SQS for MVP.

## D-008 AI
Amazon Bedrock via Converse API.

Use for:
- structured extraction
- natural phrasing
- chapter drafting
- grounded answers if needed

The model does not own truth.

## D-009 Fast Save Path
Required:
`save_answer -> DB -> job -> response`

Background:
`worker -> Bedrock -> validation -> deterministic normalization -> DB`

## D-010 Provenance
Every AI-derived historical claim must link to source answers.

## D-011 Entity Matching
Fuzzy matching creates candidates only.

No silent person merge.

## D-012 Dates
Preserve uncertainty and ranges.

Never fabricate exact dates from vague memories.

## D-013 Contradictions
Create unresolved conflict records.

Do not automatically overwrite old facts.

## D-014 Approval Boundary
Pending and approved memory are distinct.

Family-visible search defaults to approved content only.

## D-015 Infrastructure
No Redis, Kafka, Kubernetes, microservices, vector DB, GraphQL, or replacement database without explicit approval.

## D-016 Local Reproducibility
Backend must remain fully runnable locally even if cloud deployment is added later.

## D-017 Demo Integrity
The demo must use real MCP calls and real persisted state.
