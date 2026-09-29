import type { FunctionCallToolName } from "@geochat-ai/app/functioncalls";
import type { ToolExecutionResult } from "@geochat-ai/app/geogebra-protocol";
import { getFrontendGeoGebraController } from "../../geogebra/runtime";
import type { CanvasTransactionOptions } from "../../geogebra/canvas-transactions";

function redactValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (/(base64|dataurl|data_url)/i.test(key) && value.length > 512) {
      return `[redacted image payload: ${value.length} chars]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, redactValue(childValue, childKey)]));
}

export async function executeRendererTool(toolName: FunctionCallToolName, args: unknown): Promise<ToolExecutionResult> {
  // The web build routed renderer tools through an extension native host
  // and gated on that mapping. This build executes them in-process.
  const controller = getFrontendGeoGebraController();
  if (!controller) throw new Error("GeoGebra 画板尚未加载完成。");
  const value = await controller.executeTool(toolName, args);
  return normalizeToolExecutionResult(controller.ready, toolName, value);
}

export async function runRendererCanvasTransaction<T>(
  options: CanvasTransactionOptions,
  work: (execute: (toolName: FunctionCallToolName | "__restoreCanvasXml", args: unknown) => Promise<ToolExecutionResult>) => T | PromiseLike<T>,
) {
  const controller = getFrontendGeoGebraController();
  if (!controller) throw new Error("GeoGebra 画板尚未加载完成。");
  return controller.runCanvasTransaction(options, (execute) => work(async (toolName, args) => {
    const value = await execute(toolName, args);
    return normalizeToolExecutionResult(controller.ready, toolName, value);
  }));
}

function normalizeToolExecutionResult(ready: boolean, toolName: string, value: unknown): ToolExecutionResult {
  const payload = asRecord(value);
  const ok = payload.ok !== false && payload.success !== false;
  const error = typeof payload.error === "string" && payload.error.trim() ? payload.error : undefined;
  return redactToolExecutionResult({
    ok,
    results: Array.isArray(payload.results) ? payload.results as ToolExecutionResult["results"] : [],
    result: payload,
    canvasContext: payload.canvasContext ?? (toolName === "getCanvasContext" ? payload : undefined),
    canvasBefore: payload.canvasBefore,
    canvasAfter: payload.canvasAfter ?? payload.canvasContext,
    clientMeta: optionalRecord(payload.clientMeta) ?? { source: "geogebra-applet", ready },
    error,
  });
}

function redactToolExecutionResult(result: ToolExecutionResult): ToolExecutionResult {
  return redactValue(result) as ToolExecutionResult;
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function optionalRecord(value: unknown) { const record = asRecord(value); return Object.keys(record).length ? record : undefined; }
