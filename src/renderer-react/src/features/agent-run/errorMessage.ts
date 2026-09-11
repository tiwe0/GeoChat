import { AgentRunCoordinatorError } from "@geochat-ai/app/client";

type ErrorTranslator = (key: string) => string;

const ERROR_KEYS: Record<string, string> = {
  INSUFFICIENT_CREDITS: "errors.insufficientCredits",
  authentication_required: "errors.authenticationRequired",
  guest_session_required: "errors.sessionRequired",
  agent_run_start_failed: "errors.startFailed",
  runner_continuation_error: "errors.continuationFailed",
  stream_incomplete: "errors.streamIncomplete",
  run_closed: "errors.runClosed",
  canvas_session_mismatch: "errors.canvasSessionMismatch",
};

/** Convert transport/domain error codes into actionable, localized UI copy. */
export function formatAgentRunError(error: unknown, t: ErrorTranslator) {
  if (error instanceof AgentRunCoordinatorError) {
    if (error.status === 402 || error.code === "INSUFFICIENT_CREDITS") {
      return t("errors.insufficientCredits");
    }
    if (error.code === "workflow_blocked" && error.message.trim()) {
      return error.message;
    }
    const key = error.code ? ERROR_KEYS[error.code] : undefined;
    if (key) return t(key);
    return t("errors.assistantUnavailable");
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return t("errors.assistantUnavailable");
}
