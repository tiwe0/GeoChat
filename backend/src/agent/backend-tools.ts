import {
  getFunctionCallBackendExecutableToolNames,
  compileGeometryPlanToExecuteArgs,
  compileGeometryPlanToGeoGebra,
  compileAdvancedDrawingCommand,
  createGeometryPlanFromRecipe,
  normalizeConstructionRecipeInputs,
  isFunctionCallArgs,
  isAdvancedDrawingToolName,
  isConstructionRecipeId,
  searchGeoGebraCommandReference,
  type AdvancedDrawingToolName,
  type AgentRunRemoteToolRequestInput,
  type AgentRunToolRecord,
  type ActivateSkillArgs,
  type BlackboardPatchResult,
  type BlackboardEntry,
  type CreateGeometryPlanArgs,
  type ExecuteAdvancedDrawingCommandArgs,
  type FunctionCallArgsByName,
  type FunctionCallLocale,
  type ListSkillsArgs,
  type LoadSkillArgs,
  type PatchBlackboardArgs,
  type ReadBlackboardArgs,
  type SearchGeoGebraCommandsArgs,
  type SearchSkillsArgs,
  type ToolExecutionResult
} from "@geochat-ai/app";
import {
  activateAgentSkill,
  filterBusinessReadyAgentSkills,
  filterListedAgentSkills,
  listAvailableAgentSkills,
  searchAvailableAgentSkills,
  type AgentSkillSummary
} from "./skills";
import { searchCurriculum } from "./curriculum";

export type BackendToolExecutionContext = {
  runId: string;
  conversationId: string;
  prompt?: string;
  enabledAdvancedTools?: readonly string[] | null;
  locale?: FunctionCallLocale | null;
  readBlackboard: (args: ReadBlackboardArgs) => BlackboardEntry[] | Promise<BlackboardEntry[]>;
  patchBlackboard: (
    args: PatchBlackboardArgs,
    context: { runId: string; toolCallId: string }
  ) => BlackboardPatchResult | Promise<BlackboardPatchResult>;
};

export function canExecuteBackendToolRequest(request: AgentRunRemoteToolRequestInput) {
  return getFunctionCallBackendExecutableToolNames().includes(request.toolName);
}

export async function executeBackendToolRequest(
  request: AgentRunRemoteToolRequestInput,
  context: BackendToolExecutionContext,
  startedAt = new Date().toISOString()
): Promise<AgentRunToolRecord> {
  if (!canExecuteBackendToolRequest(request)) {
    throw new Error(`Backend executor does not support tool: ${request.toolName}`);
  }
  if (!isFunctionCallArgs(request.toolName, request.args)) {
    throw new Error(`Backend executor received invalid args for tool: ${request.toolName}`);
  }

  const completedAt = new Date().toISOString();
  return {
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    status: "succeeded",
    args: request.args,
    result: await executeBackendToolResult(request, context),
    error: null,
    startedAt,
    completedAt,
    durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
  };
}

async function executeBackendToolResult(request: AgentRunRemoteToolRequestInput, context: BackendToolExecutionContext) {
  if (request.toolName === "searchGeoGebraCommands") {
    const args = request.args as SearchGeoGebraCommandsArgs;
    return okBackendToolResult(searchGeoGebraCommandReference(args.query, args.topN ?? 8, context.locale, args.scope), {
      source: "backend-command-reference",
      query: args.query,
      scope: args.scope
    });
  }
  if (request.toolName === "readBlackboard") {
    const args = request.args as ReadBlackboardArgs;
    return okBackendToolResult(
      {
        conversationId: context.conversationId,
        entries: await context.readBlackboard(args)
      },
      {
        source: "backend-blackboard",
        operation: "read",
        conversationId: context.conversationId
      }
    );
  }
  if (request.toolName === "patchBlackboard") {
    const args = request.args as PatchBlackboardArgs;
    const sanitized = sanitizePatchBlackboardArgs(args);
    if (!sanitized.args.ops.length) {
      return okBackendToolResult(
        {
          conversationId: context.conversationId,
          entries: [],
          changed: 0,
          archived: 0,
          ignoredOps: sanitized.ignoredOps
        },
        {
          source: "backend-blackboard",
          operation: "patch",
          conversationId: context.conversationId,
          warning: "ignored-system-maintained-blackboard-ops"
        }
      );
    }
    return okBackendToolResult(
      {
        conversationId: context.conversationId,
        ...(await context.patchBlackboard(sanitized.args, { runId: context.runId, toolCallId: request.toolCallId })),
        ignoredOps: sanitized.ignoredOps
      },
      {
        source: "backend-blackboard",
        operation: "patch",
        conversationId: context.conversationId,
        ...(sanitized.ignoredOps > 0 ? { warning: "ignored-system-maintained-blackboard-ops" } : {})
      }
    );
  }
  if (request.toolName === "listSkills") {
    const args = request.args as ListSkillsArgs;
    const skills = filterListedAgentSkills(await listAvailableAgentSkills(), args);
    return okBackendToolResult(
      {
        skills,
        count: skills.length,
        filters: {
          category: args.category ?? null,
          source: args.source ?? null
        }
      },
      {
        source: "backend-agent-skill",
        operation: "list",
        count: skills.length
      }
    );
  }
  if (request.toolName === "searchSkills") {
    const args = request.args as SearchSkillsArgs;
    const matches = await searchAvailableAgentSkills(args);
    return okBackendToolResult(
      {
        query: args.query,
        matches,
        count: matches.length
      },
      {
        source: "backend-agent-skill",
        operation: "search",
        query: args.query,
        count: matches.length
      }
    );
  }
  if (request.toolName === "loadSkill") {
    const args = request.args as LoadSkillArgs;
    const skill = await activateAgentSkill(args.name);
    return okBackendToolResult(skill, {
      source: "backend-agent-skill",
      operation: "load",
      name: skill.name
    });
  }
  if (request.toolName === "activateSkill") {
    const args = request.args as ActivateSkillArgs;
    const skill = await activateAgentSkill(args.name);
    return okBackendToolResult(skill, {
      source: "backend-agent-skill",
      operation: "load",
      name: skill.name
    });
  }
  if (request.toolName === "createGeometryPlan") {
    const args = request.args as CreateGeometryPlanArgs;
    if (!isConstructionRecipeId(args.recipeId)) {
      throw new Error(`Unknown construction recipe: ${args.recipeId}`);
    }
    const inputNormalization = normalizeConstructionRecipeInputs({
      recipeId: args.recipeId,
      inputs: args.inputs,
      sourceText: args.sourceText ?? args.reason ?? ""
    });
    const plan = createGeometryPlanFromRecipe(args.recipeId, inputNormalization.inputs, context.locale);
    return okBackendToolResult(
      {
        plan,
        compilation: compileGeometryPlanToGeoGebra(plan),
        executeArgs: compileGeometryPlanToExecuteArgs(plan, context.locale),
        inputNormalization
      },
      {
        source: "backend-geometry-plan",
        recipeId: args.recipeId,
        extractedFields: inputNormalization.extractedFields,
        missingRequiredInputs: inputNormalization.missingRequiredInputs
      }
    );
  }
  if (request.toolName === "executeAdvancedDrawingCommand") {
    const args = request.args as ExecuteAdvancedDrawingCommandArgs;
    if (!isAdvancedDrawingToolName(args.name)) {
      throw new Error(`Unknown advanced drawing command: ${args.name}`);
    }
    const enabled = await enabledAdvancedDrawingToolNames(context);
    if (!enabled.has(args.name)) {
      throw new Error(`Advanced drawing command is not enabled by loaded skills: ${args.name}`);
    }
    const compilation = compileAdvancedDrawingCommand(args, context.locale);
    return okBackendToolResult(
      {
        ...compilation,
        enabledAdvancedTools: [...enabled].sort(),
        nextTool: {
          toolName: "executeGeoGebraCommands",
          args: compilation.executeArgs
        }
      },
      {
        source: "backend-advanced-drawing-command",
        operation: "compile",
        name: args.name,
        expectedObjects: compilation.expectedObjects
      }
    );
  }
  if (
    request.toolName === "showSolutionSteps" ||
    request.toolName === "showTeachingHint" ||
    request.toolName === "showAnimationGuide" ||
    request.toolName === "showChoiceAnalysis" ||
    request.toolName === "showSelectedElements"
  ) {
    return okBackendToolResult(request.args as FunctionCallArgsByName[typeof request.toolName], {
      source: "backend-display-card"
    });
  }
  throw new Error(`Backend executor does not support tool: ${request.toolName}`);
}

async function enabledAdvancedDrawingToolNames(context: BackendToolExecutionContext): Promise<Set<AdvancedDrawingToolName>> {
  const explicit = context.enabledAdvancedTools?.filter(isAdvancedDrawingToolName) ?? [];
  if (explicit.length) return new Set(explicit);
  if (!context.prompt?.trim()) return new Set();
  const skills = filterBusinessReadyAgentSkills(await listAvailableAgentSkills());
  const byName = new Map(skills.map((skill) => [skill.name.toLowerCase(), skill]));
  const curriculumSkillNames = searchCurriculum({ query: context.prompt, limit: 5 }).flatMap((node) => node.skillIds);
  const searched = await searchAvailableAgentSkills({
    query: [context.prompt, ...curriculumSkillNames].join("\n"),
    limit: 12
  });
  const activeSkillNames = new Set([
    ...curriculumSkillNames.map((name) => name.toLowerCase()),
    ...searched.map((skill) => skill.name.toLowerCase())
  ]);
  const enabled = new Set<AdvancedDrawingToolName>();
  for (const skillName of activeSkillNames) {
    const skill = byName.get(skillName);
    if (!skill) continue;
    for (const toolName of skill.advancedTools) {
      if (isAdvancedDrawingToolName(toolName)) enabled.add(toolName);
    }
  }
  const normalizedPrompt = normalizeAdvancedToolSearchText(context.prompt);
  for (const skill of skills) {
    const advancedToolNames = skill.advancedTools.filter(isAdvancedDrawingToolName);
    if (!advancedToolNames.length || !advancedSkillMatchesPrompt(skill, normalizedPrompt)) continue;
    activeSkillNames.add(skill.name.toLowerCase());
    for (const toolName of advancedToolNames) enabled.add(toolName);
  }
  return enabled;
}

function advancedSkillMatchesPrompt(skill: AgentSkillSummary, normalizedPrompt: string): boolean {
  const candidates = [
    skill.name,
    skill.description,
    skill.category ?? "",
    skill.parent ?? "",
    ...skill.tags,
    ...skill.recipes,
    ...skill.advancedTools
  ]
    .map(normalizeAdvancedToolSearchText)
    .filter((text) => text.length >= 2);
  return candidates.some((candidate) => normalizedPrompt.includes(candidate) || candidate.includes(normalizedPrompt));
}

function normalizeAdvancedToolSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s,，。.:：;；、/\\()[\]{}"'`“”‘’_-]+/g, "");
}

function okBackendToolResult(result: unknown, clientMeta: Record<string, unknown>): ToolExecutionResult {
  return {
    ok: true,
    results: [],
    result,
    clientMeta
  };
}

function sanitizePatchBlackboardArgs(args: PatchBlackboardArgs): { args: PatchBlackboardArgs; ignoredOps: number } {
  const ops = args.ops.filter((op) => op.category !== "canvas_state");
  return {
    args: { ...args, ops },
    ignoredOps: args.ops.length - ops.length
  };
}
