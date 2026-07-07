import { findConstructionRecipesForIntent } from "./construction-recipes";
import { currentUserPromptBeforeBlackboard } from "./agent-routing-text";
import { extractGeoGebraCommandName } from "./geogebra-command-usage";
import { findGeoGebraCommandReferenceEntry, type GeoGebraCommandReferenceEntry, type GeoGebraCommandSearchScope } from "./geogebra-command-reference";
import { repairViewportScaleCommand } from "./geogebra-style-policy";
import type { AgentRunRemoteToolRequest, AgentRunRemoteToolRequestInput } from "./remote-tool";
import type { AgentRunLedgerRecord } from "./run-ledger";
import { hasUnresolvedFailedExecute } from "./runner-phase";

export function createRequiredGeometryPlanRequest(input: {
  run: AgentRunLedgerRecord;
  recipeId: string;
  originalRequest: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId" | "toolName" | "args" | "status">[];
}): AgentRunRemoteToolRequestInput {
  const currentPrompt = currentUserPromptForRecipeMatching(input.run.prompt);
  return {
    toolCallId: `auto-geometry-plan-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "createGeometryPlan",
    args: {
      recipeId: input.recipeId,
      inputs: {},
      sourceText: currentPrompt,
      reason: input.run.locale === "en-US"
        ? `The prompt matches ${input.recipeId}; create a structured plan before running raw GeoGebra commands.`
        : `当前题目匹配 ${input.recipeId}，先生成结构化构造计划再执行原始 GeoGebra 命令。`,
      intendedOutcome: input.run.locale === "en-US"
        ? "Produce validated construction commands and extracted recipe inputs."
        : "生成经过验证的构造命令，并抽取 recipe 所需输入。",
      nextExpectedAction: input.originalRequest.toolName
    }
  };
}

export function createStylePolicyRepairRequest(input: {
  run: AgentRunLedgerRecord;
  originalRequest: AgentRunRemoteToolRequestInput;
  violationMessage: string;
  forbiddenCommands: readonly string[];
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  const originalArgs = input.originalRequest.args && typeof input.originalRequest.args === "object" && !Array.isArray(input.originalRequest.args)
    ? input.originalRequest.args as Record<string, unknown>
    : {};
  const commands = executeGeoGebraCommandsForResetPolicy(input.originalRequest.args);
  const forbidden = new Set(input.forbiddenCommands);
  const retainedCommands = commands.filter((command) => !forbidden.has(command));
  const commonArgs = {
    reason: input.run.locale === "en-US"
      ? `${input.violationMessage} The harness removed the forbidden style command(s) and is continuing with the mathematically relevant construction.`
      : `${input.violationMessage} Harness 已移除违规样式命令，并继续保留数学构造相关命令。`,
    intendedOutcome: input.run.locale === "en-US"
      ? "Preserve the valid mathematical construction while keeping default 2D visual style."
      : "保留有效数学构造，同时保持 2D 默认视觉样式。",
    nextExpectedAction: input.run.locale === "en-US"
      ? "getCanvasContext_then_repair_without_line_thickness_or_finish"
      : "getCanvasContext_then_repair_without_line_thickness_or_finish"
  };
  if (retainedCommands.length > 0) {
    return {
      toolCallId: `auto-style-policy-stripped-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
      toolName: "executeGeoGebraCommands",
      args: {
        ...originalArgs,
        commands: retainedCommands,
        ...commonArgs
      }
    };
  }
  return {
    toolCallId: `auto-style-policy-reread-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "getCanvasContext",
    args: {
      includeXml: false,
      ...commonArgs,
      intendedOutcome: input.run.locale === "en-US"
        ? "Read the current canvas and let the next model step repair using only color or light filling when semantic highlighting is needed."
        : "读取当前画布，让下一步模型在需要语义高亮时只使用颜色或轻量填充进行修复。"
    }
  };
}

export function createViewportScalePolicyRepairRequest(input: {
  run: AgentRunLedgerRecord;
  originalRequest: AgentRunRemoteToolRequestInput;
  violationMessage: string;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  const originalArgs = input.originalRequest.args && typeof input.originalRequest.args === "object" && !Array.isArray(input.originalRequest.args)
    ? input.originalRequest.args as Record<string, unknown>
    : {};
  const commands = executeGeoGebraCommandsForResetPolicy(input.originalRequest.args);
  const repairedCommands = commands.map((command) => repairViewportScaleCommand(command) ?? command);
  return {
    toolCallId: `auto-viewport-policy-repaired-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "executeGeoGebraCommands",
    args: {
      ...originalArgs,
      commands: repairedCommands,
      reason: input.run.locale === "en-US"
        ? `${input.violationMessage} The harness normalized the viewport command(s) to preserve 1:1 axis scale.`
        : `${input.violationMessage} Harness 已将视野命令规范化为等比例坐标轴。`,
      intendedOutcome: input.run.locale === "en-US"
        ? "Keep the valid construction and adjust the viewport without distorting axis scale."
        : "保留有效构造，并在不拉伸坐标轴的前提下调整视野。",
      nextExpectedAction: "getCanvasContext_then_finish_or_repair"
    }
  };
}

export function decideMissingCommandReferenceSearch(input: {
  run: AgentRunLedgerRecord;
  request: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId" | "toolName" | "args" | "status">[];
}): { type: "none" } | { type: "enqueue_tool"; nextRequest: AgentRunRemoteToolRequestInput } {
  if (input.request.toolName !== "executeGeoGebraCommands") return { type: "none" };
  if (input.run.tools.some((toolRecord) => toolRecord.toolName === "searchGeoGebraCommands" && toolRecord.status === "succeeded")) return { type: "none" };
  if (input.run.tools.some((toolRecord) => toolRecord.toolName === "createGeometryPlan" && toolRecord.status === "succeeded")) return { type: "none" };
  if (input.pendingToolRequests?.some((request) => request.toolName === "searchGeoGebraCommands" && request.status !== "failed" && request.status !== "cancelled")) {
    return { type: "none" };
  }
  return {
    type: "enqueue_tool",
    nextRequest: createRequiredCommandReferenceSearchRequest({
      run: input.run,
      originalRequest: input.request,
      pendingToolRequests: input.pendingToolRequests
    })
  };
}

export function decideGeoGebra5CommandCompatibilitySearch(input: {
  run: AgentRunLedgerRecord;
  request: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId" | "toolName" | "args" | "status">[];
}): { type: "none" } | { type: "enqueue_tool"; nextRequest: AgentRunRemoteToolRequestInput } | { type: "block"; message: string } {
  if (input.request.toolName !== "executeGeoGebraCommands") return { type: "none" };
  const commands = executeGeoGebraCommandsForResetPolicy(input.request.args);
  const issue = firstGeoGebra5CommandCompatibilityIssue(commands, input.run.locale);
  if (!issue) return { type: "none" };
  if (hasPriorCommandCompatibilitySearch(input.run, issue.commandName)) {
    return {
      type: "block",
      message: input.run.locale === "en-US"
        ? `The command ${issue.commandName} still looks incompatible with GeoGebra 5 after command-reference lookup. Rewrite the command using GeoGebra 5 syntax before executing it.`
        : `命令 ${issue.commandName} 在命令参考查询后仍疑似不兼容 GeoGebra 5。请先按 GeoGebra 5 语法改写命令，再执行。`
    };
  }
  return {
    type: "enqueue_tool",
    nextRequest: createGeoGebra5CompatibilitySearchRequest({
      run: input.run,
      issue,
      pendingToolRequests: input.pendingToolRequests
    })
  };
}

type GeoGebra5CommandCompatibilityIssue = {
  command: string;
  commandName: string;
  reason: string;
  reference?: GeoGebraCommandReferenceEntry;
};

function firstGeoGebra5CommandCompatibilityIssue(
  commands: readonly string[],
  locale?: AgentRunLedgerRecord["locale"] | null
): GeoGebra5CommandCompatibilityIssue | undefined {
  for (const command of commands) {
    const commandName = extractGeoGebraCommandName(command);
    if (isImplicitGeoGebraExpressionCommand(commandName)) continue;
    const reference = findGeoGebraCommandReferenceEntry(commandName, locale);
    if (!reference) {
      return {
        command,
        commandName,
        reason: locale === "en-US"
          ? `${commandName} is not in the GeoChat GeoGebra 5 command reference.`
          : `${commandName} 不在 GeoChat 的 GeoGebra 5 命令参考库中。`
      };
    }
    const args = topLevelCommandArgs(command);
    if (commandName === "Sphere" && args && args.length >= 4) {
      return {
        command,
        commandName,
        reference,
        reason: locale === "en-US"
          ? "GeoGebra 5 does not support Sphere(A, B, C, D); use Sphere(center, radius) or Sphere(center, pointOnSphere)."
          : "GeoGebra 5 不支持 Sphere(A, B, C, D) 四点球面；请改用 Sphere(球心, 半径) 或 Sphere(球心, 球面上一点)。"
      };
    }
  }
  return undefined;
}

function isImplicitGeoGebraExpressionCommand(commandName: string) {
  return ["Assignment", "Expression", "Function", "LineEquation", "Point"].includes(commandName);
}

function createGeoGebra5CompatibilitySearchRequest(input: {
  run: AgentRunLedgerRecord;
  issue: GeoGebra5CommandCompatibilityIssue;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  const english = input.run.locale === "en-US";
  return {
    toolCallId: `auto-geogebra5-command-search-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "searchGeoGebraCommands",
    args: {
      query: input.issue.reference
        ? `${input.issue.commandName} GeoGebra 5 command syntax`
        : `${input.issue.commandName} GeoGebra command syntax`,
      scope: commandReferenceSearchScope([input.issue.command]),
      topN: 6,
      reason: english
        ? `The model attempted a command that may not be valid in GeoGebra 5: ${input.issue.reason}`
        : `模型尝试了一个可能不符合 GeoGebra 5 的命令：${input.issue.reason}`,
      intendedOutcome: english
        ? "Return the matching command documentation or nearby command reference so the model rewrites the command before execution."
        : "返回同名命令文档或相近命令参考，让模型先改写命令再执行。",
      nextExpectedAction: "executeGeoGebraCommands"
    }
  };
}

function hasPriorCommandCompatibilitySearch(run: Pick<AgentRunLedgerRecord, "tools">, commandName: string) {
  const normalized = commandName.toLowerCase();
  return run.tools.some((toolRecord) => {
    if (toolRecord.toolName !== "searchGeoGebraCommands" || toolRecord.status !== "succeeded") return false;
    const args = toolRecord.args as { query?: unknown } | undefined;
    return typeof args?.query === "string" && args.query.toLowerCase().includes(normalized);
  });
}

function createRequiredCommandReferenceSearchRequest(input: {
  run: AgentRunLedgerRecord;
  originalRequest: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  const commands = executeGeoGebraCommandsForResetPolicy(input.originalRequest.args);
  const query = commandReferenceSearchQuery(commands);
  const scope = commandReferenceSearchScope(commands);
  return {
    toolCallId: `auto-command-search-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "searchGeoGebraCommands",
    args: {
      query,
      scope,
      reason: input.run.locale === "en-US"
        ? "The model attempted to execute GeoGebra commands before checking syntax. Search the relevant command reference first."
        : "模型在查询语法前尝试执行 GeoGebra 命令；先自动查询相关命令参考。",
      intendedOutcome: input.run.locale === "en-US"
        ? "Confirm command syntax before allowing the model to write to the canvas."
        : "确认命令语法后，再允许模型写入画布。",
      nextExpectedAction: input.originalRequest.toolName
    }
  };
}

function commandReferenceSearchQuery(commands: readonly string[]) {
  const names = commands
    .map((command) => {
      const assignedCommand = command.match(/^\s*[A-Za-z][A-Za-z0-9_]*(?:\([^)]*\))?\s*=\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/)?.[1];
      if (assignedCommand) return assignedCommand;
      return command.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/)?.[1];
    })
    .filter((name): name is string => Boolean(name));
  const uniqueNames = [...new Set(names)].slice(0, 4);
  return uniqueNames.length ? `${uniqueNames.join(" ")} GeoGebra command syntax` : "GeoGebra command syntax";
}

function commandReferenceSearchScope(commands: readonly string[]): GeoGebraCommandSearchScope {
  const text = commands.join("\n").toLowerCase();
  if (/\b(?:sphere|plane|surface|pyramid|prism|tetrahedron|cube|polyhedron)\b/u.test(text) || /=\s*\([^()]*,[^()]*,[^()]*\)/u.test(text)) {
    return "geometry-3d";
  }
  if (/\b(?:xaxis|yaxis)\b|x轴|y轴|axis|xref|yref/u.test(text)) return "axis";
  if (/\b(?:setcolor|setcaption|showlabel|setpointsize|setlinethickness|setlinestyle|setfilling|text)\b/u.test(text)) return "style";
  if (/\b(?:circle|ellipse|hyperbola|parabola|conic|circumcircle)\b/u.test(text)) return "conic";
  if (/\b(?:function|extremum|tangent|curve|sin|cos|tan|log|ln)\b|[a-z]\s*\(\s*x\s*\)\s*=/u.test(text)) return "function-graph";
  if (/\b(?:point|line|segment|midpoint|intersect|polygon|perpendicularline)\b/u.test(text)) return "geometry-2d";
  return "global";
}

export function decideDeleteCommandResetReplacement(input: {
  run: AgentRunLedgerRecord;
  request: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId" | "toolName" | "args" | "status">[];
}): { type: "none" } | { type: "enqueue_tool"; nextRequest: AgentRunRemoteToolRequestInput } | { type: "block"; message: string } {
  if (input.request.toolName !== "executeGeoGebraCommands") return { type: "none" };
  const commands = executeGeoGebraCommandsForResetPolicy(input.request.args);
  if (!commands.some(isGeoGebraDeleteCommand)) return { type: "none" };
  const currentPrompt = currentUserPromptForRecipeMatching(input.run.prompt);
  if (isAuxiliaryRemovalPrompt(currentPrompt) && !isExplicitObjectDeletionPrompt(currentPrompt)) {
    return {
      type: "enqueue_tool",
      nextRequest: createAuxiliaryHideReplacementRequest({
        run: input.run,
        originalRequest: input.request,
        commands,
        pendingToolRequests: input.pendingToolRequests
      })
    };
  }
  if (isExplicitDeletionPrompt(currentPrompt)) return { type: "none" };
  const alreadyReset = input.run.tools.some((toolRecord) => toolRecord.toolName === "resetCanvas" && toolRecord.status === "succeeded") ||
    Boolean(input.pendingToolRequests?.some((request) => request.toolName === "resetCanvas" && request.status !== "failed" && request.status !== "cancelled"));
  if (alreadyReset) {
    const retainedCommands = commands.filter((command) => !isGeoGebraDeleteCommand(command));
    if (retainedCommands.length > 0) {
      return {
        type: "enqueue_tool",
        nextRequest: createDeleteStrippedExecuteRequest({
          run: input.run,
          originalRequest: input.request,
          retainedCommands,
          pendingToolRequests: input.pendingToolRequests
        })
      };
    }
    return {
      type: "enqueue_tool",
      nextRequest: createIgnoredDeleteCleanupCanvasReadRequest({
        run: input.run,
        originalRequest: input.request,
        pendingToolRequests: input.pendingToolRequests
      })
    };
  }
  return {
    type: "enqueue_tool",
    nextRequest: createRequiredCanvasResetRequest({
      run: input.run,
      originalRequest: input.request,
      pendingToolRequests: input.pendingToolRequests
    })
  };
}

function createAuxiliaryHideReplacementRequest(input: {
  run: AgentRunLedgerRecord;
  originalRequest: AgentRunRemoteToolRequestInput;
  commands: readonly string[];
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  const originalArgs = input.originalRequest.args && typeof input.originalRequest.args === "object" && !Array.isArray(input.originalRequest.args)
    ? input.originalRequest.args as Record<string, unknown>
    : {};
  const objectNames = [...new Set(input.commands.flatMap((command) => deleteCommandObjectNames(command)))];
  return {
    toolCallId: `auto-hide-auxiliary-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "executeGeoGebraCommands",
    args: {
      ...originalArgs,
      commands: objectNames.map((name) => `SetConditionToShowObject(${name}, false)`),
      reason: input.run.locale === "en-US"
        ? "The user asked to remove auxiliary construction objects; hide them instead of deleting dependency objects from the construction."
        : "用户要求移除辅助构造对象；为避免破坏依赖关系，改为隐藏这些辅助对象而不是 Delete 删除。",
      intendedOutcome: input.run.locale === "en-US"
        ? "Keep the construction valid while removing auxiliary objects from the visible view."
        : "保留构造依赖，同时让辅助对象从视图中不可见。",
      nextExpectedAction: typeof originalArgs.nextExpectedAction === "string" ? originalArgs.nextExpectedAction : "getPNGBase64"
    }
  };
}

function createRequiredCanvasResetRequest(input: {
  run: AgentRunLedgerRecord;
  originalRequest: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId" | "toolName" | "args" | "status">[];
}): AgentRunRemoteToolRequestInput {
  const args = resetCanvasArgsFromExecuteRequest(input.originalRequest.args);
  return {
    toolCallId: `auto-reset-canvas-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "resetCanvas",
    args: {
      perspective: args.perspective,
      reason: input.run.locale === "en-US"
        ? "The model attempted to use Delete(...) while starting or repairing an unrelated canvas. Reset the whole canvas explicitly instead."
        : "模型试图用 Delete(...) 清理无关旧画布；应显式重置整个画布。",
      intendedOutcome: input.run.locale === "en-US"
        ? "Clear stale objects before running the actual construction commands."
        : "清空旧对象，再执行本题真正需要的构造命令。",
      nextExpectedAction: input.originalRequest.toolName
    }
  };
}

function createDeleteStrippedExecuteRequest(input: {
  run: AgentRunLedgerRecord;
  originalRequest: AgentRunRemoteToolRequestInput;
  retainedCommands: string[];
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  const originalArgs = input.originalRequest.args && typeof input.originalRequest.args === "object" && !Array.isArray(input.originalRequest.args)
    ? input.originalRequest.args as Record<string, unknown>
    : {};
  return {
    toolCallId: `auto-delete-stripped-execute-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "executeGeoGebraCommands",
    args: {
      ...originalArgs,
      commands: input.retainedCommands,
      reason: input.run.locale === "en-US"
        ? "resetCanvas has already cleared stale objects, so the harness stripped redundant Delete(...) commands and kept only the intended construction."
        : "resetCanvas 已经清空旧对象，harness 已剥离多余 Delete(...) 命令，只保留真正的构造命令。",
      intendedOutcome: typeof originalArgs.intendedOutcome === "string" ? originalArgs.intendedOutcome : "执行剥离清理命令后的构造。",
      nextExpectedAction: typeof originalArgs.nextExpectedAction === "string" ? originalArgs.nextExpectedAction : "getCanvasContext"
    }
  };
}

function createIgnoredDeleteCleanupCanvasReadRequest(input: {
  run: AgentRunLedgerRecord;
  originalRequest: AgentRunRemoteToolRequestInput;
  pendingToolRequests?: readonly Pick<AgentRunRemoteToolRequest, "toolCallId">[];
}): AgentRunRemoteToolRequestInput {
  return {
    toolCallId: `auto-ignore-delete-cleanup-${input.run.tools.length + (input.pendingToolRequests?.length ?? 0) + 1}`,
    toolName: "getCanvasContext",
    args: {
      includeXml: false,
      reason: input.run.locale === "en-US"
        ? "The model emitted only redundant Delete(...) cleanup after resetCanvas. Ignore the cleanup and read the current canvas instead."
        : "模型在 resetCanvas 后只发出了多余 Delete(...) 清理命令；忽略清理并读取当前画布。",
      intendedOutcome: input.run.locale === "en-US"
        ? "Preserve the existing construction and let the model continue with explanation or repair based on the real canvas."
        : "保留当前构造结果，让模型基于真实画布继续解释或修复。",
      nextExpectedAction: input.originalRequest.toolName
    }
  };
}

function executeGeoGebraCommandsForResetPolicy(args: unknown) {
  if (!args || typeof args !== "object") return [];
  const commands = (args as { commands?: unknown }).commands;
  return Array.isArray(commands) ? commands.filter((command): command is string => typeof command === "string") : [];
}

function resetCanvasArgsFromExecuteRequest(args: unknown) {
  if (!args || typeof args !== "object") return { perspective: undefined as string | undefined };
  const perspective = (args as { perspective?: unknown }).perspective;
  return { perspective: typeof perspective === "string" && perspective.trim() ? perspective : undefined };
}

function isGeoGebraDeleteCommand(command: string) {
  return /^\s*Delete\s*\(/i.test(command);
}

function deleteCommandObjectNames(command: string) {
  const args = topLevelCommandArgs(command);
  return (args ?? [])
    .map((arg) => arg.trim())
    .filter((arg) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(arg));
}

function topLevelCommandArgs(command: string): string[] | undefined {
  const start = command.indexOf("(");
  const end = command.lastIndexOf(")");
  if (start < 0 || end <= start) return undefined;
  const source = command.slice(start + 1, end);
  const args: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let current = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      current += char;
      if (char === quote && source[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function isAuxiliaryRemovalPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  return /(辅助|auxiliary).*(删除|删掉|移除|去掉|清理|隐藏|hide|remove|delete)|(?:删除|删掉|移除|去掉|清理|隐藏|hide|remove|delete).*(辅助|auxiliary)/u.test(normalized);
}

function isExplicitObjectDeletionPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  return /(彻底|永久|对象列表|从画板对象|从对象中|真实删除|真正删除|delete\s+from\s+(?:the\s+)?object|delete\s+objects?\s+permanently)/u.test(normalized);
}

function isExplicitDeletionPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (/(清空|重置|清理|clear\s+(?:the\s+)?canvas|reset\s+(?:the\s+)?canvas)/.test(normalized)) return false;
  return /(删除|删掉|移除|去掉|erase|delete|remove)\s*(点|直线|线段|圆|曲线|对象|object|point|line|segment|circle|curve)\s*[\p{L}\p{N}_-]?/u.test(normalized);
}

export function isAgentRunRawGeoGebraCommandFallback(input: {
  run: AgentRunLedgerRecord;
  request: Pick<AgentRunRemoteToolRequestInput, "toolName">;
}) {
  if (input.request.toolName !== "executeGeoGebraCommands") return false;
  if (hasUnresolvedFailedExecute(input.run)) return false;
  if (requiredGeometryPlanRecipeIdsBeforeRawCommands(input).length) return false;
  return !input.run.tools.some((toolRecord) => toolRecord.toolName === "createGeometryPlan" && toolRecord.status === "succeeded");
}

export function requiredGeometryPlanRecipeIdsBeforeRawCommands(input: {
  run: AgentRunLedgerRecord;
  request: Pick<AgentRunRemoteToolRequestInput, "toolName">;
}) {
  if (input.request.toolName !== "executeGeoGebraCommands") return [];
  if (hasUnresolvedFailedExecute(input.run)) return [];
  if (input.run.tools.some((toolRecord) => toolRecord.toolName === "createGeometryPlan" && toolRecord.status === "succeeded")) return [];
  const currentPrompt = currentUserPromptForRecipeMatching(input.run.prompt);
  if (isGeometryContinuationPrompt(currentPrompt)) return [];
  return findConstructionRecipesForIntent(currentPrompt).map((recipe) => recipe.id);
}

export function currentUserPromptForRecipeMatching(prompt: string) {
  return currentUserPromptBeforeBlackboard(prompt);
}

export function isGeometryContinuationPrompt(prompt: string) {
  const normalized = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return /(^|[，。,.!?\s])(继续|再|另外|顺便|然后|接着)(?=$|[，。,.!?\s])/.test(normalized) ||
    /(这条|这个|该图|当前|已有|上面|刚才|原来|previous|current|existing|above|same|this)/.test(normalized);
}
