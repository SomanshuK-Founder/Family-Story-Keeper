# PRIVACY.md — Trust, Approval, and Visibility

## Core Promise
AI assists family history; it does not become the authority.

Important material remains pending until approved.

## States

### Raw answer
What the narrator actually said.

### Pending derived memory
Examples:
- extracted fact
- relationship candidate
- timeline candidate
- contradiction candidate
- chapter draft

### Approved memory
Eligible for:
- family-visible search
- final timeline
- approved chapters
- family-facing answers

### Rejected / deleted
Must not reappear through normal search/chapter generation.

## Visibility
Default:
**family-visible output uses approved content only.**

Narrator-local interviewing may use bounded pending context where necessary, but pending content must not silently leak to other family members.

## Roles

### Narrator
May:
- answer questions
- review/correct pending memories
- resolve contradictions
- approve/reject relevant items
- request deletion

### Relative
May:
- access approved family-visible history
- queue questions where permitted

### Child
A limited relative role for the hackathon demo.

Do not overbuild enterprise permissions.

## Approval
Approval must be:
- explicit
- auditable
- actor-linked
- target-linked
- timestamped

Approval does not destroy provenance.

## Correction
Correction must preserve enough history to understand what changed and why.

## Deletion
Pending/recent material must have a safe delete/invalidate path.

If an answer is deleted, derived pending records that depend only on it must not remain active.

Do not fake deletion while leaving content searchable.

## Search Boundary
`search_family_story` defaults to approved family-visible content only.

## Logging
Default logs may include:
- request ID
- tool
- timing
- IDs
- status
- error category

Default logs must not include:
- raw answers
- chapter bodies
- private family questions
- prompts containing family story text

## Encryption Strategy
For hackathon:
- HTTPS/TLS
- encrypted storage volume when deployed
- strict family scoping
- redacted logs
- secure secret handling

Do not apply field encryption blindly to FTS5-searchable text without a compatible search design.

## FTS5 Rule
Index approved family-visible content only by default.

## Family Scoping
Every repository method accessing family data must enforce family scope.

Client-provided family ID alone is not authorization.

## Bedrock Context
Send only minimum necessary context to Bedrock.

Do not send the whole family database for a small task.

## UI Support Metadata
Backend responses should preserve enough metadata for Person B to show:
- pending vs approved
- provenance
- approximate date
- confidence where useful
- conflict state
- approving actor
