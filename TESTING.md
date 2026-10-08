# TESTING.md — Backend Quality Gates

## Priority Order
1. correctness
2. privacy/trust boundaries
3. MCP compatibility
4. demo scenario reliability
5. interactive latency
6. recovery/failure handling

## Unit Tests
Use for:
- date normalization
- approximate date ranges
- relationship consistency
- fuzzy candidate logic
- contradiction rules
- approval state transitions
- question priority
- visibility rules

## Repository Tests
Verify:
- family scoping
- transactions
- answer persistence
- provenance
- jobs
- contradictions
- queued questions
- approval filtering
- FTS approved-only behavior

## MCP Tests
Verify through a real client/SDK path:
- initialize
- `tools/list`
- `tools/call`
- input validation
- error behavior
- reconnect continuity
- Alexa+ target protocol compatibility

## Worker Tests
Verify:
- queued -> running -> succeeded
- queued -> running -> failed
- bounded retries
- restart recovery
- invalid model output does not corrupt DB
- raw answer survives extraction failure

## Privacy Tests
Required:
1. pending fact is hidden from family search
2. approved fact becomes visible
3. rejected fact remains hidden
4. one family cannot query another family's data
5. raw story text is not present in normal logs

## Critical End-to-End Scenario
1. Rosa starts interview.
2. Rosa mentions Raj.
3. person/relationship candidate is created.
4. state survives reconnect/restart.
5. Maya queues a question.
6. Rosa later receives Maya's question.
7. Rosa gives a conflicting year.
8. contradiction is created.
9. Rosa resolves it.
10. timeline updates correctly.
11. grounded chapter draft is generated.
12. Rosa approves it.
13. approved search returns it.
14. pending/rejected content remains hidden.

This is the highest-value backend scenario.

## Latency
Measure at least:
- `start_interview`
- `save_answer`
- `get_next_question`
- `queue_family_question`
- `approve_story_item`

Do not claim a latency target unless it is measured.

## Duplicate / Idempotency Tests
Where practical:
- duplicate answer submission does not create uncontrolled duplicate processing
- duplicate worker pickup does not duplicate final result
- repeated approval does not cause invalid state

## Failure Tests
Test:
- Bedrock timeout
- invalid Bedrock output
- worker restart
- missing reference
- unauthorized family scope
- invalid MCP input

## Seeded Demo Data
A deterministic demo seed is allowed.

Rules:
- may create starting family/person records
- must not bypass core logic to fake features

## Property Tests
Optional after core scenario stability.

Use only if valuable for:
- entity matching
- dates
- contradiction logic
