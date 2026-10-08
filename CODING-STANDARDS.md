# CODING-STANDARDS.md — Story Keeper Backend

## TypeScript
Use strict TypeScript.

Avoid:
- `any` unless isolated and justified
- unchecked JSON
- broad type assertions
- stringly typed state where unions/enums fit

Prefer:
- Zod at boundaries
- explicit domain types
- exhaustive state handling

## Layering
Preferred:
```text
MCP -> application/story services -> repositories -> DB
worker -> Bedrock adapter -> story services -> repositories
```

Avoid:
- SQL in MCP handlers
- Bedrock in repositories
- UI assumptions in DB code
- writes from unvalidated model output

## Functions
Keep responsibilities small.

Avoid a god service that calls Bedrock, merges people, writes SQL, resolves conflicts, and approves facts in one place.

## Validation
Validate:
- MCP inputs
- env/config
- job payloads
- Bedrock structured output
- important state transitions

## Errors
Use explicit categories where useful:
- NotFound
- ValidationError
- ConflictStateError
- AuthorizationError
- ExternalProviderError
- JobExecutionError

Do not leak stack traces/private content through public MCP errors.

## Logging
Use structured logs.

Log safe metadata:
- request ID
- operation
- duration
- status
- safe IDs
- error category

Redact story content.

## Database
- use migrations
- use repositories
- use transactions for dependent writes
- keep transactions narrow
- avoid manual schema patches as source of truth

## Async Jobs
Jobs must be:
- safely claimable
- retry-bounded
- observable
- restart-recoverable

No infinite retry loops.

## Dependencies
Before adding a dependency ask:
1. Is it required by current phase?
2. Can current stack handle it?
3. Does it add runtime infrastructure?
4. Does it complicate judge setup?

## Public Contracts
Once frozen:
- MCP tool names
- MCP schemas
- shared DTOs

Breaking changes require coordination.

## Comments
Comments explain:
- why
- invariant
- workaround
- protocol nuance

Do not narrate obvious code.

## Tests
Every bug fix should add a regression test when practical.

Privacy/state-transition behavior requires explicit tests.

## Security
Never commit secrets or private keys.

## Change Size
Prefer small coherent changes.

Avoid mixing unrelated refactor + feature + architecture change.

## Codex Completion Report
After each implementation task report:

### Changed
- path
- purpose

### Verified
- commands/tests run
- result

### Notes
- limitation
- follow-up
- decision needing human review
