# BEDROCK.md — AI and Background Processing Rules

## Provider
Amazon Bedrock via Converse API.

Model choice may vary by:
- availability
- latency
- structured-output reliability
- cost
- quality

Do not couple domain logic to one model ID.

## Allowed Uses

### Structured extraction
Produce candidates for:
- people
- relationships
- places
- events
- date mentions
- facts
- follow-up questions

### Question phrasing
Bedrock may phrase a deterministic question intent naturally.

### Chapter drafting
Given selected approved/relevant sources, draft a chapter.

### Grounded answers
If added later, answer using retrieved approved sources only.

## Bedrock Does Not Own
- person merges
- contradiction resolution truth
- approval
- visibility
- authorization
- exact date invention
- job state
- database transaction truth

## Processing Pattern

Required:
```text
save_answer
  -> persist raw answer
  -> queue extraction job
  -> return

worker
  -> load answer + bounded context
  -> call Bedrock
  -> validate output
  -> deterministic normalization
  -> persist candidates + provenance
```

## Output Boundary
All model output used by backend logic must pass:
1. parser
2. schema/Zod validation
3. semantic validation
4. deterministic normalization

If invalid:
- do not write malformed truth records
- preserve raw answer
- record failure
- retry only within bounded policy

## Conceptual Extraction Shape
```json
{
  "people": [],
  "relationships": [],
  "events": [],
  "places": [],
  "dateMentions": [],
  "factCandidates": [],
  "followUpCandidates": []
}
```

## Provenance
Every persisted candidate derived from an answer retains:
- answer ID
- session ID
- optional excerpt/locator

A fact without provenance cannot become approved family history.

## Prompt Grounding
Prompts must clearly separate:
- raw source evidence
- approved facts
- pending candidates
- unresolved contradictions
- system instructions

Never present pending inference as confirmed truth.

## Contradiction Language
Good:
> "I remember you previously mentioning 1962. Was the move in 1962 or 1964, or were those different events?"

Bad:
> "You were wrong before. Which date is correct?"

## Chapter Generation
Required flow:
```text
select relevant approved memories
  -> collect provenance
  -> send bounded source set
  -> draft
  -> validate
  -> save pending review
```

Model must be instructed not to invent unsupported facts.

## Cost Controls
AWS credits are a budget, not a spending target.

Use:
- concise prompts
- bounded context
- task-appropriate model
- deterministic logic instead of repeated model calls
- only necessary retries
- usage monitoring

## Failure Handling
Expected:
- timeout
- throttling
- provider error
- malformed output
- unavailable model

Behavior:
- raw answer remains safe
- job records failure
- no partial corrupt write
- interactive path remains usable

## Secrets
Never commit AWS keys, session tokens, private auth secrets, or credentials.

## Prompt Versioning
Material prompt changes should trigger regression tests for extraction shape and grounding.
