# Story Keeper development friction log

Hackathon development friction log. This log uses recorded project observations, runbooks,
source code, and targeted local verification. Severity describes practical impact on
development or demonstration. It does not imply an external service incident.

## 1. Answers saved while extraction stayed queued

- **Classification:** Application configuration and local workflow.
- **Task attempted:** Save interview answers and exercise extraction, pending-memory
  review, approval, and downstream story workflows locally.
- **Steps taken:** Saved answers through the interview workflow with the default AI
  providers disabled. Used mock extraction workers in the test harnesses to exercise
  processing without AWS calls.
- **Expected result:** Answer persistence should return immediately; an enabled
  background worker should later produce pending, source-linked memories. Saving an
  answer alone does not mean extraction has completed.
- **Actual result:** Answers were saved and extraction jobs remained queued. Both
  providers default to `disabled`, and the normal server starts extraction polling
  only when `STORY_EXTRACTION_PROVIDER=bedrock`. No extraction call was made in the
  disabled configuration. Mock workers enabled workflow testing against the real
  database and domain logic.
- **Severity and practical impact:** Medium. Answer collection remained usable, but
  a default local run could not advance newly saved answers into extracted memory;
  extraction-dependent demonstrations needed a configured worker or test harness.
- **Workaround used:** Deterministic mock extraction in the backend journey and
  browser test harnesses. `pnpm demo:smoke` exercises extraction and chapter workflows
  without AWS. These are test harnesses; `mock` is not a supported environment
  provider value.
- **Actionable suggestion:** Surface provider/worker readiness during local startup
  and explain beside the setup command that saved answers will remain queued with
  extraction disabled. Keep the documented mock smoke command easy to find.
- **Status:** Workaround found for local testing. Disabled-provider queuing remains
  intentional; the mock result does not establish live Bedrock operation.
- **Evidence:** [Provider defaults](../.env.example),
  [configuration schema](../packages/shared/src/config.ts),
  [worker startup conditions](../packages/mcp-server/src/index.ts),
  [backend journey tests](../packages/mcp-server/test/backend-journey.e2e.test.ts),
  [browser worker harness](../apps/simulator/e2e/start-backend.ts), and
  [provider recovery runbook](../packages/mcp-server/README.md#demo-recovery).

## 2. Local MCP verification does not complete production Alexa integration

- **Classification:** Unfinished application integration and deployment work.
- **Task attempted:** Establish what the locally verified backend demonstrates and
  what remains before a production Alexa voice journey can be claimed.
- **Steps taken:** Reviewed the release status and integration runbooks. Ran the
  real SDK client/server integration tests over local Streamable HTTP, including
  protocol negotiation, tool discovery/calls, and durable interview continuity.
  Reviewed the separate mock-backed backend journey coverage.
- **Expected result:** Local checks should establish the MCP contract. A production
  Alexa claim would additionally need a deployed integration and evidence from an
  actual Alexa journey.
- **Actual result:** Local MCP tests passed, including negotiation of `2025-11-25`
  and discovery of all 15 frozen tools. The README explicitly records deployment
  and production voice as unimplemented. The reviewed evidence establishes local
  operation, not a completed Alexa integration.
- **Severity and practical impact:** High for a production voice demonstration.
  Local simulator and MCP workflows are demonstrable, but production Alexa behavior
  remains unverified.
- **Workaround used:** Local simulator, real MCP integration tests, and deterministic
  backend smoke tests provided development coverage while production work remained
  unfinished. They do not substitute for Alexa acceptance testing.
- **Actionable suggestion:** Complete deployment with the project's required HTTPS
  endpoint, connect the production voice integration, and record an actual Alexa
  initialize/tool-call/interview-continuity verification. Keep local verification
  and production acceptance results separately labeled.
- **Status:** Open. The supported gaps are unfinished deployment and production
  voice integration. No specific Alexa onboarding rejection, access denial, service
  outage, or documentation defect is established by the reviewed evidence.
- **Evidence:** [Release status](../README.md#status),
  [local integration runbook](../FRONTEND-INTEGRATION.md#local-frontend-runbook),
  [MCP integration tests](../packages/mcp-server/test/mcp.integration.test.ts),
  [protocol guard](../packages/mcp-server/src/protocol.ts), and
  [deployment transport contract](../MCP-COMPLIANCE.md#target).

## 3. MCP SDK strict typing and tool output-schema workarounds

- **Classification:** External SDK interoperability, historically recorded locally.
- **Task attempted:** Implement the Phase 1 Streamable HTTP server using strict
  TypeScript and Zod tool schemas with `@modelcontextprotocol/sdk@1.32.1`.
- **Steps taken:** The existing friction log records connecting the official server
  and client transports under `exactOptionalPropertyTypes`, then calling a tool
  registered with a discriminated-union output schema through the SDK client.
- **Expected result:** Official transport classes should assign to the SDK
  `Transport` interface under the project's strict settings, and the registered
  union output schema should validate successfully.
- **Actual result:** The recorded transport declarations were incompatible with
  `Transport` because optional properties included explicit `undefined`. The union
  schema produced `Cannot read properties of undefined (reading '_zod')`. These are
  historical observations from the root log; their original failing cases were not
  reproduced during this documentation review.
- **Severity and practical impact:** Low, as recorded. Integration required narrow
  type assertions and a different public output shape; working mitigations allowed
  development to continue.
- **Workaround used:** Kept strict compiler settings and asserted `Transport` at SDK
  connection boundaries. Changed `get_next_question` to one stable output object
  with nullable question fields when the interview is complete. Current source
  retains these mitigations, and current local MCP integration tests pass.
- **Actionable suggestion:** Add SDK regression coverage for transport assignability
  with `exactOptionalPropertyTypes` and registered Zod union output schemas. Recheck
  the mitigations during a deliberate SDK upgrade before removing them.
- **Status:** Workaround found. An upstream fix has not been verified in this review.
- **Evidence:** [Original FL-001 observation](../FRICTION-LOG.md#entries),
  [SDK version](../packages/mcp-server/package.json),
  [strict compiler settings](../tsconfig.base.json),
  [server connection boundary](../packages/mcp-server/src/mcp.ts),
  [client connection boundary](../packages/mcp-client/src/StoryKeeperMcpClient.ts), and
  [stable tool output schema](../packages/mcp-server/src/tool-schemas.ts).

## Verification boundary

During this review, the following command passed: **3 test files, 15 tests**.

```text
corepack pnpm exec vitest run packages/shared/test/config.test.ts packages/mcp-server/test/mcp.integration.test.ts packages/mcp-server/test/backend-journey.e2e.test.ts
```

This verifies configuration behavior, the local MCP integration, and deterministic
backend workflows. No live Bedrock call, production Alexa journey, or upstream SDK
fix was verified. No external documentation-quality claim is made.
