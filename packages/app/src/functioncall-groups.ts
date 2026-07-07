import type { FunctionCallToolName } from "./functioncalls";

export type FunctionCallGroupId =
  | "geogebraExecution"
  | "advancedDrawing"
  | "blackboardMemory"
  | "skillDiscovery"
  | "presentationCards"
  | "choiceAnalysis"
  | "runnerControl";

export type FunctionCallGroup = {
  id: FunctionCallGroupId;
  label: string;
  reviewScope: string;
  toolNames: readonly FunctionCallToolName[];
};

export const FUNCTION_CALL_GROUPS = {
  geogebraExecution: {
    id: "geogebraExecution",
    label: "GeoGebra execution",
    reviewScope: "Canvas reads, canvas writes, command search, perspective, and geometry-plan compilation.",
    toolNames: [
      "searchGeoGebraCommands",
      "createGeometryPlan",
      "executeGeoGebraCommands",
      "resetCanvas",
      "getCanvasContext",
      "getPNGBase64",
      "setPerspective"
    ]
  },
  advancedDrawing: {
    id: "advancedDrawing",
    label: "Advanced drawing",
    reviewScope: "Skill-gated drawing commands that compile to regular GeoGebra commands.",
    toolNames: ["executeAdvancedDrawingCommand"]
  },
  blackboardMemory: {
    id: "blackboardMemory",
    label: "Blackboard and memory",
    reviewScope: "Durable conversation memory reads and controlled patch operations.",
    toolNames: ["readBlackboard", "patchBlackboard"]
  },
  skillDiscovery: {
    id: "skillDiscovery",
    label: "Skill discovery",
    reviewScope: "Skill listing, search, loading, and compatibility command aliases.",
    toolNames: ["listSkills", "searchSkills", "loadSkill", "activateSkill"]
  },
  presentationCards: {
    id: "presentationCards",
    label: "Presentation cards",
    reviewScope: "Assistant-visible explanation, hint, animation, and selected-element cards.",
    toolNames: ["showSolutionSteps", "showTeachingHint", "showAnimationGuide", "showSelectedElements"]
  },
  choiceAnalysis: {
    id: "choiceAnalysis",
    label: "Choice analysis",
    reviewScope: "Option-level reasoning and choice-specific canvas scenario contracts.",
    toolNames: ["showChoiceAnalysis"]
  },
  runnerControl: {
    id: "runnerControl",
    label: "Runner control",
    reviewScope: "Run completion and orchestration control signals.",
    toolNames: ["setFinished"]
  }
} as const satisfies Record<FunctionCallGroupId, FunctionCallGroup>;

export function getFunctionCallGroups(): FunctionCallGroup[] {
  return Object.values(FUNCTION_CALL_GROUPS);
}

export function getFunctionCallGroupForTool(toolName: FunctionCallToolName): FunctionCallGroup | undefined {
  return getFunctionCallGroups().find((group) => group.toolNames.includes(toolName));
}
