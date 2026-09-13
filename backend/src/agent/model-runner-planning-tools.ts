import { jsonSchema, tool, type Tool } from "ai";
import {
  getFunctionCallModelInputJsonSchema,
  getFunctionCallPlanningToolNames,
  getFunctionCallSpec,
  type AgentRunLedgerRecord,
  type FunctionCallToolName
} from "@geochat-ai/app";
import type { AgentSkillSelectionPacket } from "./model-runner-skills";

export function createBackendPlanningTools(
  locale?: AgentRunLedgerRecord["locale"],
  disabledToolNames: readonly FunctionCallToolName[] = [],
  skillSelection?: AgentSkillSelectionPacket,
  run?: Pick<AgentRunLedgerRecord, "tools">
) {
  const disabled = new Set(disabledToolNames);
  return Object.fromEntries(
    getFunctionCallPlanningToolNames()
      .filter((toolName) => toolName !== "searchGeoGebraCommands")
      .filter((toolName) => shouldExposeSkillDiscoveryTool(toolName, skillSelection))
      .filter((toolName) => shouldExposeBlackboardTool(toolName, run))
      .filter((toolName) => toolName !== "executeAdvancedDrawingCommand" || Boolean(skillSelection?.enabledAdvancedTools.length))
      .filter((toolName) => !disabled.has(toolName))
      .map((toolName) => [toolName, createBackendPlanningTool(toolName, locale, skillSelection)])
  ) as Record<FunctionCallToolName, ReturnType<typeof createBackendPlanningTool>>;
}

function shouldExposeSkillDiscoveryTool(toolName: FunctionCallToolName, skillSelection?: AgentSkillSelectionPacket) {
  if (!["listSkills", "searchSkills", "loadSkill", "activateSkill"].includes(toolName)) return true;
  return !skillSelection || skillSelection.status === "failed";
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
  skillSelection?: AgentSkillSelectionPacket
): Tool {
  const spec = getFunctionCallSpec(toolName, locale);
  return tool({
    title: spec.display.label,
    description: spec.description,
    inputSchema: jsonSchema(modelToolInputSchemaForRun(toolName, locale, skillSelection)),
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
    // Planning tools are executed outside the SDK; this schema documents the
    // JSON envelope returned by the executor for providers that inspect it.
    outputSchema: jsonSchema({ type: "object", additionalProperties: true })
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
