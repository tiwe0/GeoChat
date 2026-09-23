import { jsonSchema, tool, type Tool } from "ai";
import {
  getFunctionCallModelInputJsonSchema,
  getFunctionCallPlanningToolNames,
  getFunctionCallSpec,
  isFunctionCallBackendExecutable,
  type FunctionCallArgsByName,
  type AgentRunLedgerRecord,
  type FunctionCallToolName
} from "@geochat-ai/app";
import { skillRuntimePolicyFromPrompt, type AgentSkillSelectionPacket } from "./skill-selector";
import { validateNativeToolInput, type NativeToolPolicyContext } from "./native-tool-policy";

export function createBackendPlanningTools(
  locale?: AgentRunLedgerRecord["locale"],
  disabledToolNames: readonly FunctionCallToolName[] = [],
  skillSelection?: AgentSkillSelectionPacket,
  run?: Pick<AgentRunLedgerRecord, "tools"> & Partial<Pick<AgentRunLedgerRecord, "prompt">>,
  options: {
    executeBackendTool?: (
      toolName: FunctionCallToolName,
      args: unknown,
      context: { toolCallId: string }
    ) => Promise<unknown>;
  } = {}
) {
  const disabled = new Set(disabledToolNames);
  const prompt = run && "prompt" in run && typeof run.prompt === "string" ? run.prompt : "";
  return Object.fromEntries(
    getFunctionCallPlanningToolNames()
      .filter((toolName) => shouldExposeSkillDiscoveryTool(toolName, skillSelection, prompt))
      .filter((toolName) => shouldExposeBlackboardTool(toolName, run))
      .filter((toolName) => toolName !== "executeAdvancedDrawingCommand" || Boolean(skillSelection?.enabledAdvancedTools.length))
      .filter((toolName) => !disabled.has(toolName))
      .map((toolName) => [toolName, createBackendPlanningTool(toolName, locale, skillSelection, {
        prompt,
        locale,
      }, options)])
  ) as Record<FunctionCallToolName, ReturnType<typeof createBackendPlanningTool>>;
}

function shouldExposeSkillDiscoveryTool(
  toolName: FunctionCallToolName,
  skillSelection: AgentSkillSelectionPacket | undefined,
  prompt: string,
) {
  if (!["listSkills", "searchSkills", "loadSkill", "activateSkill"].includes(toolName)) return true;
  if (!skillSelection) return true;
  if (skillSelection.status !== "disabled") return true;
  return skillRuntimePolicyFromPrompt(prompt).enabled;
}

function shouldExposeBlackboardTool(toolName: FunctionCallToolName, run?: Pick<AgentRunLedgerRecord, "tools">) {
  // Working memory is useful from the first planning turn: the original
  // problem and current goal should be persisted before any drawing tool is
  // executed. Keep the tools available throughout the run instead of waiting
  // for a prior canvas write/explanation step.
  void run;
  return true;
}

function createBackendPlanningTool<TToolName extends FunctionCallToolName>(
  toolName: TToolName,
  locale?: AgentRunLedgerRecord["locale"],
  skillSelection?: AgentSkillSelectionPacket,
  policyContext: NativeToolPolicyContext = { prompt: "", locale },
  options: {
    executeBackendTool?: (
      toolName: FunctionCallToolName,
      args: unknown,
      context: { toolCallId: string }
    ) => Promise<unknown>;
  } = {}
): Tool {
  const spec = getFunctionCallSpec(toolName, locale);
  const execute = options.executeBackendTool && isFunctionCallBackendExecutable(toolName)
    ? async (args: unknown, context: { toolCallId: string }) => options.executeBackendTool!(toolName, args, context)
    : undefined;
  return tool({
    title: spec.display.label,
    description: spec.description,
    inputSchema: jsonSchema<FunctionCallArgsByName[TToolName]>(
      modelToolInputSchemaForRun(toolName, locale, skillSelection),
      {
        validate: (value) => validateNativeToolInput(toolName, value, policyContext),
      },
    ),
    // Keep execution policy visible to tracing/telemetry consumers without
    // mixing it into the model-facing description. The backend still enforces
    // these values independently when the request is executed.
    metadata: {
      source: "geochat-functioncall-registry",
      executor: spec.executor,
      sideEffectLevel: spec.sideEffectLevel,
      approvalRequired: spec.approvalRequired ?? false,
      idempotency: spec.idempotency ?? (spec.sideEffectLevel === "read" ? "idempotent" : spec.sideEffectLevel === "destructive" ? "non_idempotent" : "best_effort"),
      errorCodes: [...(spec.errorCodes ?? ["VALIDATION_ERROR", "EXECUTION_ERROR", "TIMEOUT", "CANCELLED"])],
      timeoutMs: spec.timeoutMs,
      rollbackPolicy: spec.rollbackPolicy
    },
    // Backend tools execute inside ToolLoopAgent. Renderer tools intentionally
    // omit execute so AI SDK UI can deliver them through onToolCall/addToolOutput.
    outputSchema: jsonSchema({ type: "object", additionalProperties: true }),
    ...(execute ? { execute } : {})
  } as any) as Tool;
}

function modelToolInputSchemaForRun(
  toolName: FunctionCallToolName,
  locale?: AgentRunLedgerRecord["locale"],
  skillSelection?: AgentSkillSelectionPacket
) {
  const schema = getFunctionCallModelInputJsonSchema(toolName, locale);
  if (toolName === "executeAdvancedDrawingCommand" && skillSelection?.enabledAdvancedTools.length) {
    schema.properties.name = {
      ...schema.properties.name,
      enum: skillSelection.enabledAdvancedTools
    };
  }
  return schema;
}
