const DEFAULT_FRAME_COUNT = 4;
const MIN_FRAME_COUNT = 2;
const MAX_FRAME_COUNT = 8;
const DEFAULT_INTERVAL_MS = 500;
const MIN_INTERVAL_MS = 100;
const MAX_INTERVAL_MS = 2_000;
const MAX_REQUESTED_DURATION_MS = 14_000;
const MAX_AGGREGATE_BASE64_LENGTH = 12 * 1024 * 1024;

type CanvasFrameCapture = (input: Record<string, unknown>) =>
  | Record<string, unknown>
  | Promise<Record<string, unknown>>;

export async function captureCanvasFrames(
  input: Record<string, unknown>,
  capture: CanvasFrameCapture,
  wait: (ms: number) => Promise<unknown>,
  now: () => number = Date.now,
) {
  const count = optionalBoundedInteger(input.count, "count", DEFAULT_FRAME_COUNT, MIN_FRAME_COUNT, MAX_FRAME_COUNT);
  const intervalMs = optionalBoundedInteger(
    input.intervalMs,
    "intervalMs",
    DEFAULT_INTERVAL_MS,
    MIN_INTERVAL_MS,
    MAX_INTERVAL_MS,
  );
  const requestedDurationMs = (count - 1) * intervalMs;
  if (requestedDurationMs > MAX_REQUESTED_DURATION_MS) {
    throw new Error(`Frame sampling duration must not exceed ${MAX_REQUESTED_DURATION_MS}ms.`);
  }

  const captureInput = { ...input };
  delete captureInput.count;
  delete captureInput.intervalMs;

  const startedAt = now();
  const frames: Array<Record<string, unknown>> = [];
  let aggregateBase64Length = 0;

  for (let index = 0; index < count; index += 1) {
    if (index > 0) await wait(intervalMs);

    const elapsedMs = Math.max(0, now() - startedAt);
    const captured = await capture(captureInput);
    const base64 = captured.base64;
    if (typeof base64 !== "string" || base64.length === 0) {
      throw new Error(`Frame ${index + 1} did not return non-empty PNG base64 data.`);
    }

    aggregateBase64Length += base64.length;
    if (aggregateBase64Length > MAX_AGGREGATE_BASE64_LENGTH) {
      throw new Error("Captured frames exceed the 12MB aggregate base64 limit.");
    }

    frames.push({ ...captured, index, elapsedMs });
  }

  return {
    ok: true as const,
    frames,
    sampling: { requestedIntervalMs: intervalMs, count },
    limitations: "finite samples do not prove smoothness between captured frames or the absence of transient artifacts.",
  };
}

function optionalBoundedInteger(
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${field} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value as number;
}
