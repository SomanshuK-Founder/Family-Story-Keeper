# FRICTION-LOG.md — Amazon / MCP / AWS Development Friction

## Status
**Phase 1 encountered two genuine MCP SDK issues; both currently have working mitigations.**

Do not fabricate entries.

Use this file for real issues involving:
- Alexa+ documentation
- MCP SDK/spec behavior
- MCP Apps
- Bedrock
- AWS credits/onboarding
- sample code
- deployment guidance
- version compatibility

## Entry Template

### FL-XXX — Short Title

**Date:**  
**Person:** Person A / Person B  
**Area:** Alexa+ / MCP / MCP Apps / Bedrock / AWS / Documentation / Other

**Task**
What were we trying to do?

**Expected**
What did docs/tooling lead us to expect?

**Actual**
What happened?

**Impact**
Low / Medium / High / Blocking

**Evidence**
Error, package version, minimal reproduction, documentation URL.

Do not include secrets or private story content.

**Workaround**
How did we move forward?

**Suggested improvement**
What should Amazon/MCP docs/tooling improve?

**Status**
Open / Workaround found / Resolved

## Entries

### FL-001 — MCP SDK strict transport typing and union output validation

**Date:** 2026-10-08

**Person:** Person A

**Area:** MCP

**Task**
Implement and test the Phase 1 Streamable HTTP server with strict TypeScript and Zod tool schemas.

**Expected**
The official SDK transport classes would assign directly to the SDK `Transport` interface, and a
Zod discriminated union would work as a registered tool output schema.

**Actual**
With `@modelcontextprotocol/sdk@1.32.1` and `exactOptionalPropertyTypes`, both official HTTP
transport classes conflict with the SDK `Transport` interface because their optional callback or
session properties include explicit `undefined`. A discriminated-union output schema also returned
an internal `Cannot read properties of undefined (reading '_zod')` tool error.

**Impact**
Low

**Evidence**
TypeScript reported `StreamableHTTPServerTransport` and `StreamableHTTPClientTransport` as not
assignable to `Transport` under exact optional typing. The union failure reproduced through the
official SDK client over Streamable HTTP.

**Workaround**
Keep strict compiler settings and use narrow casts only at the two SDK `connect` boundaries. Use a
single stable output object for `get_next_question`, with nullable question fields when complete.

**Suggested improvement**
Align transport class declarations with the exported `Transport` interface under
`exactOptionalPropertyTypes`, and add registered-tool output tests for Zod unions.

**Status**
Workaround found
