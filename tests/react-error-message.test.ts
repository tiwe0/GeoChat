import { describe, expect, test } from "bun:test";
import { AgentRunCoordinatorError } from "@geochat-ai/app/client";
import { formatAgentRunError } from "../src/renderer-react/src/features/agent-run/errorMessage";

const translate = (key: string) => `translated:${key}`;

describe("agent error diagnostics", () => {
  test("keeps backend code and original message instead of generic connection copy", () => {
    const error = new AgentRunCoordinatorError("Provider rejected the API key", {
      status: 401,
      code: "provider_auth_failed",
      payload: { error: "provider_auth_failed", message: "Provider rejected the API key" },
    });
    expect(formatAgentRunError(error, translate)).toBe("provider_auth_failed: Provider rejected the API key");
  });

  test("keeps renderer/network error messages", () => {
    expect(formatAgentRunError(new Error("Failed to fetch"), translate)).toBe("Failed to fetch");
  });
});
