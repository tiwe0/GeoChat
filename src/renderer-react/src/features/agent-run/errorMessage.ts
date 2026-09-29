import { createStructuredLogger } from "@geochat-ai/app/structured-logger";

const logger = createStructuredLogger("agent-run.error-message");

type ErrorTranslator = (key: string) => string;

/** Preserve transport/domain diagnostics so the UI can show and copy the original failure. */
export function formatAgentRunError(error: unknown, t: ErrorTranslator) {
  if (error instanceof Error) {
    const message = error.message.trim();
    const code = "code" in error && typeof error.code === "string" ? error.code.trim() : "";
    if (message) return code ? `${code}: ${message}` : message;
  }
  if (typeof error === "string" && error.trim()) return error;
  if (error !== null && error !== undefined) {
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch (caughtError) {
      logger.debug("error_serialize_failed", "AGENT_ERROR_SERIALIZE_FAILED", { error: caughtError });
      // Fall through to the localized fallback for an unserializable value.
    }
  }
  return t("errors.assistantUnavailable");
}
