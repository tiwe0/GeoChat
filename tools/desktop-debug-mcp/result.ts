import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function toolResult<T extends Record<string, unknown>>(structuredContent: T): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2)
      }
    ],
    structuredContent
  };
}

export function blockedResult(message: string, details: Record<string, unknown> = {}) {
  return toolResult({
    ok: false,
    blocked: true,
    message,
    ...details
  });
}
