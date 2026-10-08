# PROJECT.md — Family Story Keeper

## Product Summary
Family Story Keeper is a voice-first family-history assistant for the Alexa+ track of the Amazon Developer Hackathon.

It interviews a relative across short sessions, remembers prior context, follows important details, surfaces family-submitted questions, detects possible contradictions, and gradually builds a family timeline and written chapters.

The family remains the authority over what becomes permanent family history.

## One-Line Pitch
**An Alexa+ agent that turns five-minute conversations into a family's living history.**

## Core Experience
Example:
> "Alexa, ask Story Keeper to talk with Grandma Rosa."

Story Keeper asks one question:
> "What do you remember about the street you grew up on?"

Rosa answers.

The system may follow up:
> "You mentioned Raj. How were you two related?"

If later answers conflict:
> "I remember you previously mentioning 1962. Was the move in 1962 or 1964, or were those different events?"

A relative may queue:
> "Maya wants to know how you met Grandpa."

Story Keeper may draft a chapter:
> "Does that sound right?"

Only approved material becomes permanent family-visible history.

## Backend Mission
The backend owns:
- durable interview sessions
- answers and provenance
- extracted people, relationships, facts, places, and timeline events
- approximate dates
- contradiction candidates
- family-question queue
- approval state
- chapter drafts and approved chapters
- approved-history search
- MCP tool contracts
- Bedrock orchestration
- background jobs
- privacy/visibility enforcement
- auditability and deletion support

## Why This Is More Than a Chatbot
The backend must demonstrate:
1. persistent multi-session memory
2. structured family memory
3. provenance
4. contradiction detection
5. human approval
6. asynchronous family questions
7. grounded chapter generation
8. approved-history search

## Backend MVP
- real MCP Streamable HTTP server
- durable SQLite interview state
- `start_interview`
- `save_answer`
- `get_next_question`
- Bedrock structured extraction
- facts and provenance
- person/relationship candidates
- approximate dates
- contradiction resolution
- approval boundary
- family-question queue
- chapter drafting backend
- approved-history search
- end-to-end scenario tests

## Deferred Unless Explicitly Promoted
- vector database
- Redis
- SQS
- Kafka
- Kubernetes
- microservices
- GraphQL
- genealogy/DNA integrations
- advanced photo/video processing
- enterprise RBAC
- multi-region architecture

## Team Split
### Person A — Backend Owner
Owns MCP, database, Bedrock, story engine, contradiction logic, approvals, search, backend tests, deployment support.

### Person B — Experience Owner
Owns simulator, voice/typed UI, timeline UI, family graph UI, chapter review UI, MCP Apps, demo presentation.

## Success Scenario
The real backend must support:
1. start Rosa interview
2. save answer
3. extract Raj relationship candidate
4. persist context across reconnect/later session
5. store Maya's question
6. detect conflicting year
7. resolve conflict
8. generate grounded chapter
9. approve chapter
10. retrieve result through approved search
