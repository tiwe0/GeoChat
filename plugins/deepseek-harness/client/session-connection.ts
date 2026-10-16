import { NATIVE_CANVAS_NAMESPACE } from "../src/native-protocol.ts";
import type { NativeCanvasConnection } from "./native-connection.ts";

function isMissingDraftAgent(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const failure = error as { code?: unknown; isDSHRemoteError?: unknown; details?: unknown };
  if (failure.code !== "gateway/lookup-not-found" || failure.isDSHRemoteError !== true) return false;
  const details = failure.details as { endpoint?: unknown; field?: unknown } | undefined;
  return details?.endpoint === `${NATIVE_CANVAS_NAMESPACE}/connect` && details.field === "agentId";
}

/** A draft has no Agent yet. Retry only the initial subscription, never commands. */
export async function connectSessionCanvas(options: {
  readonly signal: AbortSignal;
  readonly connect: () => NativeCanvasConnection;
  readonly onDisconnected: () => void;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const wait = options.wait ?? waitForRetry;
  let attempts = 0;
  while (!options.signal.aborted) {
    let connection: NativeCanvasConnection | undefined;
    let retryable = false;
    const dispose = () => connection?.dispose();
    options.signal.addEventListener("abort", dispose, { once: true });
    try {
      connection = options.connect();
      await connection.done;
    } catch (error) {
      retryable = isMissingDraftAgent(error);
    } finally {
      options.signal.removeEventListener("abort", dispose);
      connection?.dispose();
    }
    if (options.signal.aborted) return;
    if (connection?.hasHandshake || !retryable) {
      options.onDisconnected();
      return;
    }
    await wait(Math.min(500 * 2 ** Math.min(attempts++, 4), 5_000), options.signal);
  }
}

function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}
