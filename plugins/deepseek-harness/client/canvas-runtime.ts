import { GeoGebraController } from "../../../src/renderer-react/src/geogebra/controller.ts";
import {
  mountGeoGebra,
  type GeoGebraApi,
  type GeoGebraApplet
} from "../../../src/renderer-react/src/geogebra/ggbdeploy-wrapper.ts";

import { CANVAS_TOOLS } from "../src/canvas-tools.ts";
import { validateInput, type InputSchema } from "../src/validation.ts";

export const CANVAS_STATUS_TOOL = "getCanvasStatus";

export type CanvasRuntimeSnapshot =
  | { readonly phase: "loading" }
  | { readonly phase: "ready" }
  | { readonly phase: "error"; readonly message: string }
  | { readonly phase: "disposed" };

export type CanvasRuntimeMount = {
  readonly applet: GeoGebraApplet | GeoGebraApi;
  dispose(): void;
};

type CanvasTransactionOptions = {
  readonly label: string;
  readonly readOnly?: boolean;
  readonly shouldContinue?: () => boolean;
};

export interface CanvasRuntimeController {
  readonly ready: boolean;
  setApi(api: GeoGebraApi | null): void;
  runCanvasTransaction<T>(
    options: CanvasTransactionOptions,
    work: (execute: (toolName: string, args: unknown) => Promise<unknown>) => T | PromiseLike<T>
  ): Promise<T>;
}

type MountOptions = {
  readonly container: HTMLElement;
  readonly assetBaseUrl: string;
  readonly signal?: AbortSignal;
  readonly onReady: (api: GeoGebraApi) => void;
  readonly onError?: (error: Error) => void;
};

export interface CanvasRuntime {
  readonly stage: HTMLElement;
  readonly parkingHost: HTMLElement;
  readonly ready: Promise<void>;
  getSnapshot(): CanvasRuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  attach(container: HTMLElement): () => void;
  run(toolName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  dispose(): void;
}

export interface CanvasRuntimeOptions {
  readonly assetBaseUrl: string;
}

export interface CanvasRuntimeDependencies {
  readonly document?: Document;
  readonly controller?: CanvasRuntimeController;
  readonly mount?: (options: MountOptions) => Promise<CanvasRuntimeMount>;
}

const EMPTY_SCHEMA: InputSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false
};

const TOOL_SCHEMAS = new Map<string, InputSchema>(
  CANVAS_TOOLS.map((tool) => [
    tool.name,
    {
      type: "object",
      properties: tool.properties as Record<string, InputSchema>,
      required: tool.required,
      additionalProperties: false
    }
  ])
);

const READ_ONLY_TOOLS = new Set<string>([
  "inspectGeoGebraObjects",
  "getCanvasContext",
  "sceneReport",
  "captureFrames",
  "getPNGBase64",
  "getValue",
  "getValueString",
  "exists",
  "getObjectType"
]);

export function createCanvasRuntime(
  options: CanvasRuntimeOptions,
  dependencies: CanvasRuntimeDependencies = {}
): CanvasRuntime {
  const document = dependencies.document ?? globalThis.document;
  const controller = dependencies.controller ?? new GeoGebraController();
  const mount = dependencies.mount ?? mountGeoGebra;
  const listeners = new Set<() => void>();
  const mountAbort = new AbortController();
  const stage = document.createElement("div");
  const appletHost = document.createElement("div");
  const parkingHost = document.createElement("div");
  let snapshot: CanvasRuntimeSnapshot = { phase: "loading" };
  let disposed = false;
  let attachment: symbol | undefined;
  let mounted: CanvasRuntimeMount | undefined;
  let settleReady!: () => void;
  let readySettled = false;
  const ready = new Promise<void>((resolve) => {
    settleReady = () => {
      if (readySettled) return;
      readySettled = true;
      resolve();
    };
  });

  Object.assign(parkingHost.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "900px",
    height: "620px",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none"
  });
  parkingHost.setAttribute("aria-hidden", "true");
  Object.assign(stage.style, {
    position: "relative",
    width: "100%",
    height: "100%",
    minWidth: "0",
    minHeight: "0",
    overflow: "hidden",
    background: "#ffffff",
    pointerEvents: "auto"
  });
  Object.assign(appletHost.style, { width: "100%", height: "100%" });
  stage.appendChild(appletHost);
  parkingHost.appendChild(stage);
  document.body.appendChild(parkingHost);

  const setSnapshot = (next: CanvasRuntimeSnapshot) => {
    if (disposed && next.phase !== "disposed") return;
    snapshot = next;
    for (const listener of listeners) listener();
    if (next.phase !== "loading") settleReady();
  };

  const mountPromise = mount({
    container: appletHost,
    assetBaseUrl: options.assetBaseUrl.replace(/\/$/, ""),
    signal: mountAbort.signal,
    onReady(api) {
      if (disposed) return;
      controller.setApi(api);
      setSnapshot({ phase: "ready" });
    },
    onError() {
      if (disposed) return;
      controller.setApi(null);
      setSnapshot({ phase: "error", message: "GeoGebra 画布加载失败。" });
    }
  });
  void mountPromise.then(
    (result) => {
      if (disposed) result.dispose();
      else mounted = result;
    },
    (error: unknown) => {
      if (disposed || isAbortError(error)) return;
      controller.setApi(null);
      setSnapshot({ phase: "error", message: "GeoGebra 画布加载失败。" });
    }
  );

  return {
    stage,
    parkingHost,
    ready,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attach(container) {
      if (disposed) throw new Error("GeoGebra 画布已关闭。");
      const lease = Symbol("canvas-attachment");
      attachment = lease;
      container.replaceChildren(stage);
      return () => {
        if (disposed || attachment !== lease) return;
        attachment = undefined;
        parkingHost.appendChild(stage);
      };
    },
    async run(toolName, args, signal) {
      if (disposed) throw new Error("GeoGebra 画布已关闭。");
      if (toolName === CANVAS_STATUS_TOOL) {
        validateInput(args, EMPTY_SCHEMA);
        return { ok: true, phase: snapshot.phase, ready: controller.ready };
      }
      const schema = TOOL_SCHEMAS.get(toolName);
      if (!schema) throw new Error(`GeoChat 不支持工具 ${toolName}。`);
      validateInput(args, schema);
      if (!controller.ready) throw new Error("GeoGebra 画布尚未加载完成。");
      const shouldContinue = () => !disposed && signal?.aborted !== true;
      try {
        return await controller.runCanvasTransaction(
          {
            label: `harness:${toolName}`,
            readOnly: READ_ONLY_TOOLS.has(toolName),
            shouldContinue
          },
          async (execute) => {
            const result = await execute(toolName, args);
            if (!READ_ONLY_TOOLS.has(toolName) && mutationFailed(result)) {
              throw new CanvasMutationResultError(result);
            }
            return result;
          }
        );
      } catch (error) {
        if (error instanceof CanvasMutationResultError) return error.result;
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      attachment = undefined;
      mountAbort.abort();
      mounted?.dispose();
      mounted = undefined;
      controller.setApi(null);
      stage.remove();
      parkingHost.remove();
      snapshot = { phase: "disposed" };
      for (const listener of listeners) listener();
      listeners.clear();
      settleReady();
    }
  };
}

class CanvasMutationResultError extends Error {
  constructor(readonly result: unknown) {
    super("Canvas mutation returned a failed result.");
  }
}

function mutationFailed(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.ok === false || record.success === false;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
