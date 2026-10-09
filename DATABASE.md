# DATABASE.md — Story Keeper Data Contract

## Technology
- SQLite
- Drizzle
- migrations
- repository boundary

## Global Invariants
1. Use stable opaque IDs.
2. Every family-scoped row must be queryable under family scope.
3. Client-supplied family ID is not authorization.
4. Raw answers are evidence and must not be silently rewritten.
5. AI-derived claims require provenance.
6. Pending and approved are separate states.
7. Contradictions preserve evidence until resolved.
8. Dependent deletes must not leave family-visible orphaned derived data.
9. Dependent writes use transactions.
10. Story engine does not issue SQL directly.

## Core Tables

### `families`
Fields conceptually:
- id
- display_name
- created_at
- updated_at

### `people`
- id
- family_id
- canonical_display_name
- status
- created_at
- updated_at

Ambiguous identities may exist temporarily.

### `person_candidates`
- id
- family_id
- candidate_person_id
- answer_id
- job_id
- extracted_name
- confidence
- status
- possible_match_person_id
- match_score
- created_at
- updated_at

Phase 3 stores an extracted unresolved name as a separate inactive person candidate. It does not
merge the candidate into an existing person automatically.

### `family_memberships`
- id
- family_id
- person_id
- role
- status

Target roles:
- narrator
- relative
- child

## Interviews

### `interview_sessions`
- id
- family_id
- narrator_person_id
- status
- started_at
- last_active_at
- created_at
- updated_at

This is application state, not an MCP transport session.

### `questions`
- id
- family_id
- interview_session_id
- type
- text
- source
- source_reference_id
- status
- asked_at
- created_at

Possible sources:
- planner
- family_queue
- contradiction
- clarification
- follow_up

Question types through Phase 6:
- phase_one_prompt
- contradiction_clarification
- family_question
- person_clarification
- memory_follow_up

Question status:
- asked
- answered
- superseded

### `answers`
- id
- family_id
- interview_session_id
- question_id
- narrator_person_id
- raw_text
- created_at

Raw text is immutable evidence except explicit deletion/redaction.

## Story Memory

### `facts`
- id
- family_id
- subject_person_id
- fact_type
- normalized_value
- confidence
- approval_status
- created_at
- updated_at

Status:
- pending
- approved
- rejected

### `fact_sources`
- id
- family_id
- fact_id
- answer_id
- source_excerpt_or_locator
- created_at

Approved facts require provenance.

### `relationships`
- id
- family_id
- from_person_id
- to_person_id
- relationship_type
- confidence
- approval_status
- created_at
- updated_at

No silent merge from fuzzy similarity.

### `relationship_sources`
- id
- family_id
- relationship_id
- answer_id
- job_id
- created_at

AI-derived relationships retain their source answer and extraction job.

### `timeline_events`
- id
- family_id
- subject_person_id
- event_type
- title
- description
- earliest_year
- latest_year
- date_precision
- approval_status
- created_at
- updated_at

Date precision:
- exact
- approximate
- range
- unknown

Do not fabricate month/day when evidence is only year-level.

### `timeline_event_sources`
- id
- family_id
- timeline_event_id
- answer_id
- job_id
- created_at

AI-derived timeline events retain their source answer and extraction job.

## Contradictions

### `contradictions`
- id
- family_id
- contradiction_type
- left_fact_id
- right_fact_id
- status
- resolution_type
- resolution_note
- resolved_by_person_id
- resolved_at
- created_at

Status:
- unresolved
- resolved
- dismissed

Phase 4 resolution types:
- keep_left
- keep_right
- different_events
- dismiss_not_a_conflict

`corrected_value` is deferred until corrected claims can retain truthful resolution provenance.

Resolution never erases source evidence.

## Family Questions

### `queued_questions`
- id
- family_id
- from_person_id
- to_person_id
- question_text
- priority
- status
- created_at
- asked_at
- answered_at

Status:
- queued
- asked
- answered
- skipped
- withdrawn

Family questions are selected by priority descending, then creation time and stable ID ascending.
Surfacing one creates an ordinary interview question with source `family_queue` and a stable source
reference, while atomically moving the queue item to `asked`. Saving its answer atomically moves the
queue item to `answered` alongside the raw answer and extraction job.

## Chapters

### `chapter_drafts`
- id
- family_id
- narrator_person_id
- title
- body
- status
- created_at
- updated_at

Status:
- generating
- pending_review
- rejected
- superseded

### `chapters`
- id
- family_id
- narrator_person_id
- title
- body
- approved_at
- approved_by_person_id
- created_at
- updated_at

Source links must be retained.

## Approval / Consent

### `approvals`
- id
- family_id
- actor_person_id
- target_type
- target_id
- action
- created_at

Actions:
- approve
- reject
- revoke

Phase 5 transitions are explicit: `approve` moves pending to approved, `reject` moves pending to
rejected, and `revoke` moves approved to rejected. Facts, relationships, and timeline events require
valid source-answer provenance before approval. Relationship approval is blocked while either
identity is an unresolved person candidate.

### `consent_events`
- id
- family_id
- person_id
- event_type
- target_type
- target_id
- created_at

Phase 5 records story-item approval, rejection, revocation, and pending-memory deletion events.
Pending-memory deletion is a rejected-state tombstone for derived memory; it preserves raw answers
and provenance while removing the item from active context.

## Jobs

### `jobs`
- id
- family_id
- type
- payload
- deduplication_key
- status
- attempt_count
- max_attempts
- available_at
- locked_at
- locked_by
- completed_at
- error_code
- created_at
- updated_at

Status:
- queued
- running
- succeeded
- failed
- cancelled

Requirements:
- bounded retries
- transactional claim
- restart recovery

## Audit

### `audit_log`
Prefer metadata:
- actor
- family
- action
- target
- status
- timestamp
- request_id

Do not store raw private story text by default.

## Search
FTS5 indexes approved family-visible content.

Initial searchable material:
- approved facts
- approved timeline text
- approved chapters
- approved source excerpts if privacy policy allows

Pending/rejected material is excluded by default.

## Migration Rule
All schema changes use migrations.

Do not rely on manually patched databases.
