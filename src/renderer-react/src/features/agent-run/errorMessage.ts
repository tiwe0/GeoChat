import { AgentRunCoordinatorError } from "@geochat-ai/app/client";

type ErrorTranslator = (key: string) => string;

/** Preserve transport/domain diagnostics so the UI can show and copy the original failure. */
export function formatAgentRunError(error: unknown, t: ErrorTranslator) {
  if (error instanceof AgentRunCoordinatorError) {
    const message = error.message.trim();
    if (message) return error.code ? `${error.code}: ${message}` : message;
    const payload = error.payload;
    if (payload !== undefined) {
      try {
        return JSON.stringify(payload);
      } catch {
        // Fall through to the localized fallback when the payload is not serializable.
      }
    }
    return `Agent run coordinator request failed: ${error.status}`;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error !== null && error !== undefined) {
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Fall through to the localized fallback for an unserializable value.
    }
  }
  return t("errors.assistantUnavailable");
}
