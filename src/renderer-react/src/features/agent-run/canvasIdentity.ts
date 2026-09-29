import { createStructuredLogger } from "@geochat-ai/app/structured-logger";

const logger = createStructuredLogger("agent-run.canvas-identity");

const CANVAS_SESSION_ID_KEY = "geogebraCopilotCanvasSessionId";

let cachedCanvasSessionId: string | null = null;

export function getCanvasSessionId() {
  if (cachedCanvasSessionId) return cachedCanvasSessionId;
  try {
    const existing = window.sessionStorage.getItem(CANVAS_SESSION_ID_KEY);
    if (existing) return (cachedCanvasSessionId = existing);
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(CANVAS_SESSION_ID_KEY, created);
    return (cachedCanvasSessionId = created);
  } catch (caughtError) {
    logger.debug("session_storage_unavailable", "CANVAS_SESSION_STORAGE_UNAVAILABLE", { error: caughtError });
    return (cachedCanvasSessionId = crypto.randomUUID());
  }
}
