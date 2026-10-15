# MCP-COMPLIANCE.md — Alexa+ Backend Contract

## Target
Story Keeper targets:
- MCP `2025-11-25`
- Streamable HTTP
- HTTPS when deployed

Official references:
- https://www.developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http
- https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions

## Version Rule
The current TypeScript SDK supports both 2025-era and newer MCP behavior.

The Alexa+ compatibility path must explicitly support/test `2025-11-25`.

Do not assume newer protocol behavior can replace the Alexa+ target.

## Endpoint
Conceptually expose:
```text
/mcp
```

Use the official SDK and Streamable HTTP behavior.

Do not use deprecated standalone HTTP+SSE as the primary Alexa+ transport.

## Session Rule
MCP transport session state is not durable product state.

Story Keeper's durable interview session must be an application record in SQLite.

This must survive:
- reconnect
- browser refresh
- server restart
- later date
- different client

## Security
At minimum:
- validate Host/Origin appropriately
- use HTTPS in deployed environments
- validate all tool inputs
- enforce server-side family/user scope when auth is introduced
- never treat client-provided family ID as authorization by itself

## Tool Design
Tools should be:
- semantic
- stable
- minimal in count
- schema-validated
- deterministic in shape

Avoid low-level CRUD tool explosion.

## Target Tool Vocabulary

### `start_interview`
Start/resume narrator interview and return durable interview identity + question.

### `save_answer`
Persist answer, link it to interview/question, enqueue processing, return quickly.

Must not wait for Bedrock extraction.

### `get_next_question`
Choose next question based on current structured state.

Intended priority:
1. unresolved contradiction
2. queued family question
3. incomplete major event
4. unexplored important person
5. general coverage question

### `get_story_context`
Return relevant narrator-safe context while respecting visibility.

The additive `personIdentities` read field provides only identities relevant to narrator context:
- confirmed active person references include a display name
- unresolved extracted candidates include the extracted display name and an optional possible-match display name
- relative and child approved-family responses do not include narrator-private candidate details

It does not expose candidate row IDs, match scores, raw answers, or identity-resolution actions.

### `queue_family_question`
Persist a question from one relative to another narrator.

### `list_pending_conflicts`
Return unresolved contradiction candidates.

### `resolve_conflict`
Record resolution while preserving source history.

### `request_chapter_draft`
Queue grounded chapter generation.

### `review_chapter`
Return draft + source references + status.

### `approve_story_item`
Approve supported pending fact/event/relationship/chapter.

### `search_family_story`
Search approved family-visible history by default.

### `delete_pending_memory`
Delete/invalidate recent or unapproved material according to policy.

## Schema Stability
Before freeze: schemas may evolve.

After freeze:
- tool rename requires human approval
- breaking required-field change requires human approval
- breaking response shape requires human approval

Prefer additive optional changes.

## MCP Tests
Eventually verify:
- initialize compatibility
- `tools/list`
- tool calls
- schema rejection
- Streamable HTTP behavior
- Host/Origin protections
- reconnect behavior
- durable interview continuity across transport reconnect

## MCP Apps
Person B owns UI.

Backend provides stable structured data for:
- timeline
- family graph
- chapter review

No UI-specific database hacks.
