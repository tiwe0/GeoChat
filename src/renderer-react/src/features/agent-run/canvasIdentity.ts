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
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/agent-run/canvasIdentity.ts:13", caughtError);
    return (cachedCanvasSessionId = crypto.randomUUID());
  }
}
