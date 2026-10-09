import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

export const ALEXA_MCP_PROTOCOL_VERSION = '2025-11-25';

export function assertAlexaMcpCompatibility(): void {
  if (
    !isAlexaProtocolVersion(LATEST_PROTOCOL_VERSION) ||
    !SUPPORTED_PROTOCOL_VERSIONS.includes(ALEXA_MCP_PROTOCOL_VERSION)
  ) {
    throw new Error(
      `The installed MCP SDK must negotiate ${ALEXA_MCP_PROTOCOL_VERSION} for Alexa+ compatibility.`,
    );
  }
}

function isAlexaProtocolVersion(version: string): boolean {
  return version === ALEXA_MCP_PROTOCOL_VERSION;
}
