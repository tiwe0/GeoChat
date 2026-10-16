import type { ISidebarRight } from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type { TypertClientRemote } from "@deepseek-ai/dsh-typert-protocol";

import { NATIVE_CANVAS_NAMESPACE } from "../src/native-protocol.ts";
import {
  createNativeCanvasConnection,
  type NativeCanvasConnection,
  type NativeCanvasRuntime
} from "./native-connection.ts";

const CANVAS_TAB_KIND = "geochat-canvas";
const OPEN_CANVAS_COMMAND = "openCanvas";
const SURFACE_NOT_MOUNTED = "sidebarRight: no session surface is mounted";

export type CanvasOpenerSidebar = Pick<ISidebarRight, "mounted" | "openTab" | "active" | "isExpanded">;

type Wait = (milliseconds: number, signal: AbortSignal) => Promise<void>;

function cancelledError(): Error {
  return new Error("Canvas open was cancelled.");
}

function assertCurrentSession(sidebarRight: CanvasOpenerSidebar, sessionId: string, signal: AbortSignal): void {
  if (signal.aborted) throw cancelledError();
  if (sidebarRight.mounted.getSnapshot() !== sessionId) {
    throw new Error("The requested Harness session is no longer on screen.");
  }
}

function isSurfaceNotMounted(error: unknown): boolean {
  return error instanceof Error && error.message === SURFACE_NOT_MOUNTED;
}

function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(cancelledError());
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(cancelledError());
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function createCanvasOpenerRuntime(
  sidebarRight: CanvasOpenerSidebar,
  sessionId: string,
  options: { readonly timeoutMs?: number; readonly wait?: Wait } = {}
): NativeCanvasRuntime {
  const timeoutMs = options.timeoutMs ?? 1_000;
  const wait = options.wait ?? waitForRetry;
  return {
    async run(toolName, args, signal) {
      if (toolName !== OPEN_CANVAS_COMMAND) throw new TypeError("Canvas opener only accepts openCanvas.");
      if (Object.keys(args).length !== 0) throw new TypeError("openCanvas does not accept arguments.");
      const deadline = Date.now() + timeoutMs;
      let attempt = 0;
      while (true) {
        assertCurrentSession(sidebarRight, sessionId, signal);
        try {
          sidebarRight.openTab(CANVAS_TAB_KIND);
          break;
        } catch (error) {
          if (!isSurfaceNotMounted(error) || Date.now() >= deadline) throw error;
        }
        assertCurrentSession(sidebarRight, sessionId, signal);
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(SURFACE_NOT_MOUNTED);
        await wait(Math.min(25 * 2 ** Math.min(attempt++, 4), remaining), signal);
      }
      assertCurrentSession(sidebarRight, sessionId, signal);
      if (sidebarRight.active()?.kind !== CANVAS_TAB_KIND || !sidebarRight.isExpanded()) {
        throw new Error("Harness did not activate the GeoChat canvas.");
      }
      return { opened: true };
    }
  };
}

function isMissingDraftAgent(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const failure = error as { code?: unknown; isDSHRemoteError?: unknown; details?: unknown };
  if (failure.code !== "gateway/lookup-not-found" || failure.isDSHRemoteError !== true) return false;
  const details = failure.details as { endpoint?: unknown; field?: unknown } | undefined;
  return details?.endpoint === `${NATIVE_CANVAS_NAMESPACE}/connectUi` && details.field === "agentId";
}

async function connectCanvasOpenerSession(options: {
  readonly signal: AbortSignal;
  readonly connect: () => NativeCanvasConnection;
  readonly onDisconnected: () => void;
  readonly wait?: Wait;
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

export function mountCanvasOpener(options: {
  readonly remote: TypertClientRemote;
  readonly sidebarRight: CanvasOpenerSidebar;
  readonly connect?: typeof createNativeCanvasConnection;
  readonly wait?: Wait;
  readonly onDisconnected?: (sessionId: string) => void;
}): () => void {
  const connect = options.connect ?? createNativeCanvasConnection;
  let activeSession: string | undefined;
  let activeController: AbortController | undefined;
  let disposed = false;

  const reconcile = () => {
    if (disposed) return;
    const sessionId = options.sidebarRight.mounted.getSnapshot();
    if (sessionId === activeSession) return;
    activeController?.abort("Harness session changed.");
    activeController = undefined;
    activeSession = sessionId;
    if (!sessionId) return;

    const controller = new AbortController();
    activeController = controller;
    const runtime = createCanvasOpenerRuntime(options.sidebarRight, sessionId);
    void connectCanvasOpenerSession({
      signal: controller.signal,
      connect: () =>
        connect({
          remote: options.remote,
          sessionId,
          runtime,
          signal: controller.signal,
          channel: "connectUi"
        }),
      wait: options.wait,
      onDisconnected: () => options.onDisconnected?.(sessionId)
    }).catch(() => {
      if (!controller.signal.aborted) options.onDisconnected?.(sessionId);
    });
  };

  const unsubscribe = options.sidebarRight.mounted.subscribe(reconcile);
  reconcile();
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    activeController?.abort("Canvas opener disposed.");
    activeController = undefined;
    activeSession = undefined;
  };
}
