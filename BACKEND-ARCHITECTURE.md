# BACKEND-ARCHITECTURE.md — Story Keeper Backend

## Goal
Build the smallest reliable backend that proves:
- real MCP integration
- persistent interviews
- structured family memory
- source provenance
- contradiction handling
- approval-gated history
- family-question queue
- chapter drafting
- approved-history search

## High-Level Flow

```text
Alexa+ compatible client / simulator
                |
                v
          MCP Streamable HTTP
                |
                v
        Story Keeper MCP Server
                |
        +-------+--------+
        |                |
        v                v
   Story Engine      Repository Layer
        |                |
        |                v
        |             SQLite
        |
        v
     Jobs Table
        |
        v
   Background Worker
        |
        v
   Amazon Bedrock
        |
        v
Validated structured result
        |
        v
Deterministic normalization
        |
        v
Repository writes
```

## Conceptual Modules

### MCP Server
Owns:
- transport integration
- initialization
- tool registration
- tool schema validation
- request context
- public error mapping

Must not contain core story logic.

### Story Engine
Owns:
- question planning
- entity candidate resolution
- relationship consistency
- timeline logic
- date normalization
- contradiction detection
- approval rules
- queued-question prioritization

Must not issue SQL directly.

### Database
Owns:
- Drizzle schema
- migrations
- repositories
- transactions
- jobs
- FTS

Must not call Bedrock.

### Bedrock Adapter
Owns:
- Converse client
- structured extraction
- chapter drafting
- prompt construction
- output parsing/validation

Must not decide final database truth.

### Shared
Owns:
- domain types
- Zod schemas
- stable enums/status values
- DTOs shared with Person B

## Fast Interactive Requests
Examples:
- `start_interview`
- `save_answer`
- `get_next_question`
- `queue_family_question`
- `approve_story_item`
- `resolve_conflict`

These should use bounded DB work and avoid long model calls.

## Slow Background Work
Examples:
- extract story memory
- generate chapter
- expensive grounded generation

These use persisted jobs.

## Source of Truth
The database is authoritative, not:
- Bedrock output
- MCP session memory
- browser state
- simulator state
- prompt text

## Domain Layers
### Raw answers
Narrator's actual words.

### Extracted candidates
Model/deterministic interpretations.

### Facts
Normalized claims with provenance.

### Timeline events
Structured events with uncertainty and sources.

### Relationships
Structured links with provenance.

### Contradictions
Unresolved incompatibilities.

### Approved memory
Content eligible for family-visible history.

## Worker Contract
Worker should:
1. transactionally claim job
2. mark processing/lease
3. execute task
4. validate output
5. normalize deterministically
6. persist transactionally
7. mark complete
8. preserve failure metadata

Retries must be bounded.

A failed extraction must never delete the raw answer.

## Error Philosophy
Prefer explicit failure over silent corruption.

Examples:
- invalid model output -> fail/retry job
- ambiguous identity -> unresolved candidate
- contradiction -> conflict record
- missing approval -> not family-visible
- duplicate request -> idempotent handling where feasible

## Observability
Log safe metadata:
- request ID
- tool name
- duration
- success/failure
- job type/status
- provider/model metadata where safe

Do not log raw family story text by default.

## Performance
Interactive path must remain fast.

No synchronous Bedrock call in `save_answer`.

## Scalability Position
This is a hackathon architecture.

Optimize for correctness, trust, reproducibility, demo reliability, and low operational complexity.
