import { describe, expect, test } from "bun:test";
import { formatAgentRunError } from "../src/renderer-react/src/features/agent-run/errorMessage";

const translate = (key: string) => `translated:${key}`;

describe("agent error diagnostics", () => {
  test("keeps backend code and original message instead of generic connection copy", () => {
    const error = Object.assign(new Error("Provider rejected the API key"), { code: "provider_auth_failed" });
    expect(formatAgentRunError(error, translate)).toBe("provider_auth_failed: Provider rejected the API key");
  });

  test("keeps renderer/network error messages", () => {
    expect(formatAgentRunError(new Error("Failed to fetch"), translate)).toBe("Failed to fetch");
  });
});
