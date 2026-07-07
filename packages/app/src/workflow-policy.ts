import type { FunctionCallToolName } from "./functioncalls";
import type { AgentRunToolRecord } from "./run-ledger";

export type AgentWorkflowPhase = "needs_canvas_read" | "planning" | "writing" | "verifying" | "explaining";

export type AgentWorkflowState = {
  phase: AgentWorkflowPhase;
  hasInitialCanvasRead: boolean;
  hasCommandReferenceSearch: boolean;
  hasGeometryPlan: boolean;
  hasCanvasWrite: boolean;
  hasVerificationAfterWrite: boolean;
};

export type AgentWorkflowDecision = {
  allowed: boolean;
  reason?: string;
};

const explanationTools = new Set<FunctionCallToolName>(["showSolutionSteps", "showTeachingHint", "showAnimationGuide", "showChoiceAnalysis", "showSelectedElements"]);
const verificationTools = new Set<FunctionCallToolName>(["getCanvasContext", "getPNGBase64"]);
const blackboardTools = new Set<FunctionCallToolName>(["readBlackboard", "patchBlackboard"]);
const skillTools = new Set<FunctionCallToolName>(["listSkills", "searchSkills", "loadSkill", "activateSkill"]);

const allowedToolsByPhase = {
  needs_canvas_read: new Set<FunctionCallToolName>(["listSkills", "searchSkills", "loadSkill", "activateSkill", "getCanvasContext"]),
  planning: new Set<FunctionCallToolName>([
    "searchGeoGebraCommands",
    "readBlackboard",
    "patchBlackboard",
    "listSkills",
    "searchSkills",
    "loadSkill",
    "activateSkill",
    "createGeometryPlan",
    "executeAdvancedDrawingCommand",
    "executeGeoGebraCommands",
    "resetCanvas",
    "getCanvasContext",
    "getPNGBase64",
    "showSolutionSteps",
    "showTeachingHint",
    "showAnimationGuide",
    "showChoiceAnalysis",
    "showSelectedElements",
    "setPerspective"
  ]),
  writing: new Set<FunctionCallToolName>([]),
  verifying: new Set<FunctionCallToolName>(["getCanvasContext", "getPNGBase64"]),
  explaining: new Set<FunctionCallToolName>([
    "searchGeoGebraCommands",
    "readBlackboard",
    "patchBlackboard",
    "listSkills",
    "searchSkills",
    "loadSkill",
    "activateSkill",
    "createGeometryPlan",
    "executeAdvancedDrawingCommand",
    "executeGeoGebraCommands",
    "resetCanvas",
    "getCanvasContext",
    "getPNGBase64",
    "showSolutionSteps",
    "showTeachingHint",
    "showAnimationGuide",
    "showChoiceAnalysis",
    "showSelectedElements",
    "setPerspective"
  ])
} satisfies Record<AgentWorkflowPhase, Set<FunctionCallToolName>>;

export function createInitialAgentWorkflowState(): AgentWorkflowState {
  return {
    phase: "needs_canvas_read",
    hasInitialCanvasRead: false,
    hasCommandReferenceSearch: false,
    hasGeometryPlan: false,
    hasCanvasWrite: false,
    hasVerificationAfterWrite: false
  };
}

export function evaluateAgentWorkflowToolCall(state: AgentWorkflowState, toolName: FunctionCallToolName): AgentWorkflowDecision {
  const allowedTools = allowedToolsByPhase[state.phase];
  if (!allowedTools.has(toolName)) {
    if (state.phase === "needs_canvas_read") {
      return {
        allowed: false,
        reason: "工作流要求第一步必须读取 GeoGebra 画布上下文。"
      };
    }
    if (state.phase === "verifying") {
      return {
        allowed: false,
        reason: "画布构造写入后必须先通过 getCanvasContext 或 getPNGBase64 验证，再继续构造或生成解释。"
      };
    }
    return {
      allowed: false,
      reason: `当前工作流阶段 ${state.phase} 不允许调用 ${toolName}。`
    };
  }
  if (state.hasCanvasWrite && !state.hasVerificationAfterWrite && !verificationTools.has(toolName)) {
    return {
      allowed: false,
      reason: "画布构造写入后必须先通过 getCanvasContext 或 getPNGBase64 验证，再继续构造或生成解释。"
    };
  }
  if (toolName === "executeGeoGebraCommands" && !state.hasCommandReferenceSearch && !state.hasGeometryPlan) {
    return {
      allowed: false,
      reason: "执行原始 GeoGebra 命令前必须先调用 searchGeoGebraCommands 查询相关语法，或先通过 createGeometryPlan 生成结构化构造计划。"
    };
  }
  return { allowed: true };
}

export function advanceAgentWorkflowState(
  state: AgentWorkflowState,
  toolName: FunctionCallToolName,
  succeeded: boolean
): AgentWorkflowState {
  if (!succeeded) return state;
  if (toolName === "getCanvasContext") {
    return {
      ...state,
      phase: state.hasCanvasWrite ? "explaining" : "planning",
      hasInitialCanvasRead: true,
      hasVerificationAfterWrite: state.hasCanvasWrite ? true : state.hasVerificationAfterWrite
    };
  }
  if (toolName === "getPNGBase64") {
    return {
      ...state,
      phase: state.hasCanvasWrite ? "explaining" : state.phase,
      hasVerificationAfterWrite: state.hasCanvasWrite ? true : state.hasVerificationAfterWrite
    };
  }
  if (toolName === "executeGeoGebraCommands") {
    return {
      ...state,
      phase: "verifying",
      hasCanvasWrite: true,
      hasVerificationAfterWrite: false
    };
  }
  if (toolName === "resetCanvas") {
    return state.phase === "needs_canvas_read"
      ? state
      : {
          ...state,
          phase: "planning",
          hasCanvasWrite: false,
          hasVerificationAfterWrite: true
        };
  }
  if (toolName === "searchGeoGebraCommands") {
    return state.phase === "needs_canvas_read"
      ? state
      : { ...state, phase: "planning", hasCommandReferenceSearch: true };
  }
  if (toolName === "createGeometryPlan" || toolName === "executeAdvancedDrawingCommand") {
    return state.phase === "needs_canvas_read"
      ? state
      : { ...state, phase: "planning", hasGeometryPlan: true };
  }
  if (toolName === "setPerspective") {
    return state.phase === "needs_canvas_read" ? state : { ...state, phase: "planning" };
  }
  if (explanationTools.has(toolName)) {
    return {
      ...state,
      phase: "explaining"
    };
  }
  if (blackboardTools.has(toolName)) {
    return state.phase === "needs_canvas_read" ? state : { ...state };
  }
  if (skillTools.has(toolName)) {
    return state.phase === "needs_canvas_read" ? state : { ...state };
  }
  return state.phase === "needs_canvas_read" ? state : { ...state, phase: "planning" };
}

export function deriveAgentWorkflowStateFromTools(
  tools: readonly Pick<AgentRunToolRecord, "toolName" | "status">[]
): AgentWorkflowState {
  return tools.reduce(
    (state, toolRecord) => advanceAgentWorkflowState(state, toolRecord.toolName, toolRecord.status === "succeeded"),
    createInitialAgentWorkflowState()
  );
}

export function evaluateAgentWorkflowToolRecord(
  tools: readonly Pick<AgentRunToolRecord, "toolCallId" | "toolName" | "status">[],
  toolRecord: Pick<AgentRunToolRecord, "toolCallId" | "toolName">
) {
  const priorTools = tools.filter((item) => item.toolCallId !== toolRecord.toolCallId);
  return evaluateAgentWorkflowToolCall(deriveAgentWorkflowStateFromTools(priorTools), toolRecord.toolName);
}
