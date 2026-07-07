import { jsonSchema, tool } from "ai";
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
  if (!["readBlackboard", "patchBlackboard"].includes(toolName)) return true;
  if (!run) return true;
  return run.tools.some((tool) =>
    [
      "createGeometryPlan",
      "executeAdvancedDrawingCommand",
      "executeGeoGebraCommands",
      "setPerspective",
      "showSolutionSteps",
      "showTeachingHint",
      "showAnimationGuide",
      "showChoiceAnalysis",
      "showSelectedElements",
      "setFinished"
    ].includes(tool.toolName)
  );
}

function createBackendPlanningTool<TToolName extends FunctionCallToolName>(
  toolName: TToolName,
  locale?: AgentRunLedgerRecord["locale"],
  skillSelection?: AgentSkillSelectionPacket
) {
  const spec = getFunctionCallSpec(toolName, locale);
  return tool({
    title: spec.display.label,
    description: spec.description,
    inputSchema: jsonSchema(modelToolInputSchemaForRun(toolName, locale, skillSelection))
  });
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
