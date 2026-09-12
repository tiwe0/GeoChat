import type { AgentRunRemoteToolRequest, AgentRunToolRecord } from "@geochat-ai/app/client";
import type { ToolExecutionResult } from "@geochat-ai/app/geogebra-protocol";
import { getFrontendGeoGebraController } from "../../geogebra/runtime";
import { readCachedToolResult, saveCachedToolResult } from "./activeRunStorage";

export async function executeRemoteToolRequest(request: AgentRunRemoteToolRequest): Promise<AgentRunToolRecord> {
  const startedAt = new Date().toISOString();
  const cached = await readCachedToolResult(request);
  if (cached) return cached;
  let tool: AgentRunToolRecord;
  try {
    const result = await executeRendererTool(request.toolName, request.args);
    const completedAt = new Date().toISOString();
    tool = {
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: result.ok ? "succeeded" : "failed",
      args: request.args,
      result,
      canvasBefore: result.canvasBefore,
      canvasAfter: result.canvasAfter ?? result.canvasContext,
      error: result.ok ? null : result.error ?? "Renderer tool failed.",
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    tool = {
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      status: "failed",
      args: request.args,
      error: error instanceof Error ? error.message : "Renderer tool failed.",
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };
  }
  await saveCachedToolResult(request, tool);
  return tool;
}

export async function executeRendererTool(toolName: AgentRunRemoteToolRequest["toolName"], args: unknown): Promise<ToolExecutionResult> {
  // The web build routed renderer tools through an extension native host
  // and gated on that mapping. This build executes them in-process.
  const controller = getFrontendGeoGebraController();
  if (!controller) throw new Error("GeoGebra 画板尚未加载完成。");
  const value = await controller.executeTool(toolName, args);
  const payload = asRecord(value);
  const ok = payload.ok !== false && payload.success !== false;
  const error = typeof payload.error === "string" && payload.error.trim() ? payload.error : undefined;
  return {
    ok,
    results: Array.isArray(payload.results) ? payload.results as ToolExecutionResult["results"] : [],
    result: payload,
    canvasContext: payload.canvasContext ?? (toolName === "getCanvasContext" ? payload : undefined),
    canvasBefore: payload.canvasBefore,
    canvasAfter: payload.canvasAfter ?? payload.canvasContext,
    clientMeta: optionalRecord(payload.clientMeta) ?? { source: "geogebra-applet", ready: controller.ready },
    error,
  };
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function optionalRecord(value: unknown) { const record = asRecord(value); return Object.keys(record).length ? record : undefined; }
