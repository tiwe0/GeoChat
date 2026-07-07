import {
  getFunctionCallDisplayInfo,
  getFunctionCallSpec,
  getFunctionCallStatusLabel,
  compileGeometryPlanToExecuteArgs,
  compileGeometryPlanToGeoGebra,
  createGeometryPlanFromRecipe,
  normalizeGeoGebraFreeParameterCommands,
  normalizeConstructionRecipeInputs,
  isConstructionRecipeId,
  searchGeoGebraCommandReference,
  type DesktopFunctionCall,
  type FunctionCallArgsByName,
  type FunctionCallSpec,
  type FunctionCallStatus,
  type FunctionCallToolName,
  type ToolDisplayInfo,
  type ToolExecutionResult
} from "@geochat-ai/app";
import type { GeoGebraExecutionPayload, GeoGebraPngBase64Payload, GeoGebraResetPayload, createGeoGebraController } from "./geogebra";
import { interpolate, type RendererI18n } from "./i18n";

export type { ToolDisplayInfo } from "@geochat-ai/app";

export type FunctionCallCard = {
  title: string;
  summary?: string | null;
  answer?: string | null;
  steps?: Array<{ label: string; body: string }>;
  items?: string[] | null;
  commands?: string[] | null;
  controls?: string[] | null;
  observations?: string[] | null;
  baseConditions?: string[] | null;
  displayMode?: "single_active_choice" | "compare_choices" | "text_only" | null;
  choices?: Array<{
    label: "A" | "B" | "C" | "D";
    statement: string;
    verdict: "true" | "false" | "unknown";
    explanation: string;
    constructionFocus?: string | null;
    evidence?: string[] | null;
    commands?: string[] | null;
  }> | null;
  elements?: Array<{
    label: string;
    type?: string | null;
    description?: string | null;
    role?: string | null;
  }> | null;
  nextActionHint?: string | null;
};

type GeoGebraController = ReturnType<typeof createGeoGebraController>;

export function toolDisplayInfo(toolName: FunctionCallToolName): ToolDisplayInfo {
  return getFunctionCallDisplayInfo(toolName);
}

export function toolStatusLabel(toolName: FunctionCallToolName, status: FunctionCallStatus, hasError = false) {
  return getFunctionCallStatusLabel(toolName, status, hasError);
}

function okResult(result?: unknown, extra: Partial<ToolExecutionResult> = {}): ToolExecutionResult {
  return { ok: true, results: [], result, ...extra };
}

function errorResult(error: unknown): ToolExecutionResult {
  return {
    ok: false,
    results: [],
    error: error instanceof Error ? error.message : String(error)
  };
}

function attachToolPolicy(result: ToolExecutionResult, spec: FunctionCallSpec): ToolExecutionResult {
  return {
    ...result,
    clientMeta: {
      ...result.clientMeta,
      toolPolicy: {
        executor: spec.executor,
        sideEffectLevel: spec.sideEffectLevel,
        timeoutMs: spec.timeoutMs,
        rollbackPolicy: spec.rollbackPolicy
      }
    }
  };
}

function timeoutToolResult(toolName: FunctionCallToolName, spec: FunctionCallSpec, copy?: RendererI18n): ToolExecutionResult {
  return {
    ok: false,
    results: [],
    error: `${copy?.tools.displays[toolName]?.label ?? spec.display.label} timed out (${spec.timeoutMs}ms).`,
    clientMeta: {
      source: "tool-policy",
      reason: "timeout",
      timeoutMs: spec.timeoutMs
    }
  };
}

async function runToolWithPolicy(
  toolName: FunctionCallToolName,
  operation: () => ToolExecutionResult | Promise<ToolExecutionResult>,
  copy?: RendererI18n
): Promise<ToolExecutionResult> {
  const spec = getFunctionCallSpec(toolName);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ToolExecutionResult>((resolve) => {
    timer = setTimeout(() => resolve(timeoutToolResult(toolName, spec, copy)), spec.timeoutMs);
  });

  try {
    const result = await Promise.race([Promise.resolve().then(operation), timeout]);
    if (timer) clearTimeout(timer);
    return attachToolPolicy(result, spec);
  } catch (error) {
    if (timer) clearTimeout(timer);
    return attachToolPolicy(errorResult(error), spec);
  }
}

function workflowBlockedResult(reason: string): ToolExecutionResult {
  return {
    ok: false,
    results: [],
    error: reason,
    clientMeta: {
      source: "workflow-policy",
      reason: "blocked"
    }
  };
}

function asExecutionResult(payload: GeoGebraExecutionPayload): ToolExecutionResult {
  return {
    ok: payload.ok,
    results: payload.results,
    result: payload,
    canvasContext: payload.canvasContext,
    canvasBefore: payload.canvasBefore,
    canvasAfter: payload.canvasAfter,
    clientMeta: payload.clientMeta,
    error: payload.error
  };
}

function asResetResult(payload: GeoGebraResetPayload): ToolExecutionResult {
  return {
    ok: payload.ok,
    results: payload.results,
    result: {
      ok: payload.ok,
      reset: true,
      error: payload.error ?? null
    },
    canvasContext: payload.canvasContext,
    canvasBefore: payload.canvasBefore,
    canvasAfter: payload.canvasAfter,
    clientMeta: payload.clientMeta,
    error: payload.error
  };
}

function asPngResult(payload: GeoGebraPngBase64Payload): ToolExecutionResult {
  return {
    ok: true,
    results: [],
    result: {
      base64: payload.base64,
      mediaType: payload.mediaType,
      exportScale: payload.exportScale,
      transparent: payload.transparent,
      dpi: payload.dpi,
      byteEstimate: payload.byteEstimate
    },
    clientMeta: payload.clientMeta
  };
}

async function executeFrontendFunctionCall(call: DesktopFunctionCall, geogebra: GeoGebraController): Promise<ToolExecutionResult> {
  switch (call.toolName) {
    case "searchGeoGebraCommands": {
      const args = call.args as FunctionCallArgsByName["searchGeoGebraCommands"];
      return okResult(searchGeoGebraCommandReference(args.query, args.topN ?? 8, undefined, args.scope), {
        clientMeta: { source: "desktop-local-command-reference", query: args.query, scope: args.scope }
      });
    }
    case "createGeometryPlan": {
      const args = call.args as FunctionCallArgsByName["createGeometryPlan"];
      if (!isConstructionRecipeId(args.recipeId)) return errorResult(`Unknown construction recipe: ${args.recipeId}`);
      const inputNormalization = normalizeConstructionRecipeInputs({
        recipeId: args.recipeId,
        inputs: args.inputs,
        sourceText: args.sourceText ?? args.reason ?? ""
      });
      const plan = createGeometryPlanFromRecipe(args.recipeId, inputNormalization.inputs);
      return okResult(
        {
          plan,
          compilation: compileGeometryPlanToGeoGebra(plan),
          executeArgs: compileGeometryPlanToExecuteArgs(plan),
          inputNormalization
        },
        {
          clientMeta: {
            source: "desktop-local-geometry-plan",
            recipeId: args.recipeId,
            extractedFields: inputNormalization.extractedFields,
            missingRequiredInputs: inputNormalization.missingRequiredInputs
          }
        }
      );
    }
    case "executeGeoGebraCommands": {
      const args = call.args as FunctionCallArgsByName["executeGeoGebraCommands"];
      if (!args.commands.length) return { ok: false, results: [], error: "executeGeoGebraCommands requires non-empty commands." };
      const spec = getFunctionCallSpec("executeGeoGebraCommands");
      const commands = normalizeGeoGebraFreeParameterCommands(args.commands, {
        declaredNames: existingGeoGebraObjectNames(geogebra.getCanvasContext(false))
      });
      return asExecutionResult(
        await geogebra.executeCommands(commands, {
          perspective: args.perspective,
          resetBefore: args.resetBefore,
          restoreOnError: args.restoreOnError ?? (spec.rollbackPolicy === "rollback_on_error")
        })
      );
    }
    case "resetCanvas": {
      const args = call.args as FunctionCallArgsByName["resetCanvas"];
      return asResetResult(await geogebra.reset(args.perspective));
    }
    case "getCanvasContext": {
      const args = call.args as FunctionCallArgsByName["getCanvasContext"];
      const canvasContext = geogebra.getCanvasContext(Boolean(args.includeXml));
      return okResult(canvasContext, {
        canvasContext,
        clientMeta: { source: "geogebra-applet", ready: "ready" in canvasContext ? canvasContext.ready : false }
      });
    }
    case "getPNGBase64": {
      const args = call.args as FunctionCallArgsByName["getPNGBase64"];
      return asPngResult(await geogebra.getPNGBase64(args));
    }
    case "showSolutionSteps":
    case "showTeachingHint":
    case "showAnimationGuide":
    case "showChoiceAnalysis":
    case "showSelectedElements":
      return okResult(call.args as FunctionCallCard, { clientMeta: { source: "display-card" } });
    case "setPerspective": {
      const args = call.args as FunctionCallArgsByName["setPerspective"];
      const result = await geogebra.setPerspective(args.mode ?? args.perspective);
      return result.success ? okResult(result) : { ok: false, results: [], result, error: result.error };
    }
    default:
      return { ok: false, results: [], error: `Renderer cannot execute unknown tool: ${call.toolName}` };
  }
}

function existingGeoGebraObjectNames(canvasContext: unknown) {
  const names = new Set<string>();
  if (!canvasContext || typeof canvasContext !== "object") return names;
  const context = canvasContext as { object_index?: unknown; expressions?: unknown };
  if (context.object_index && typeof context.object_index === "object") {
    for (const labels of Object.values(context.object_index)) {
      if (!Array.isArray(labels)) continue;
      for (const label of labels) {
        if (typeof label === "string" && label) names.add(label);
      }
    }
  }
  if (Array.isArray(context.expressions)) {
    for (const label of context.expressions) {
      if (typeof label === "string" && label) names.add(label);
    }
  }
  return names;
}

export async function executeFunctionCall(call: DesktopFunctionCall, geogebra: GeoGebraController, copy?: RendererI18n): Promise<ToolExecutionResult> {
  return runToolWithPolicy(call.toolName, async () => {
    if (getFunctionCallSpec(call.toolName).executor !== "frontend") {
      return { ok: false, results: [], error: `Renderer cannot execute backend-owned tool: ${call.toolName}` };
    }
    const result = await executeFrontendFunctionCall(call, geogebra);
    if (!result) return { ok: false, results: [], error: copy ? interpolate(copy.tools.noFinalResult, { tool: toolDisplayInfo(call.toolName).label }) : `${toolDisplayInfo(call.toolName).label} returned no final result.` };
    return result;
  }, copy);
}
