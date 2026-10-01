let cachedCanvasSessionId: string | null = null;

export function getCanvasSessionId() {
  cachedCanvasSessionId ??= crypto.randomUUID();
  return cachedCanvasSessionId;
}
