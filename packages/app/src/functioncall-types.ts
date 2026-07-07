export type FunctionCallToolName =
  | "searchGeoGebraCommands"
  | "readBlackboard"
  | "patchBlackboard"
  | "listSkills"
  | "searchSkills"
  | "loadSkill"
  | "activateSkill"
  | "createGeometryPlan"
  | "executeAdvancedDrawingCommand"
  | "executeGeoGebraCommands"
  | "resetCanvas"
  | "getCanvasContext"
  | "getPNGBase64"
  | "showSolutionSteps"
  | "showTeachingHint"
  | "showAnimationGuide"
  | "showChoiceAnalysis"
  | "showSelectedElements"
  | "setFinished"
  | "setPerspective";

export type FunctionCallExecutor = "frontend" | "backend";

export type FunctionCallSideEffectLevel = "read" | "write" | "destructive";

export type FunctionCallStatus = "requested" | "running" | "done" | "error";
export type FunctionCallLocale = "zh-CN" | "en-US";

export type ToolDisplayInfo = {
  label: string;
  running: string;
  done: string;
  error: string;
  metric: string;
  detailsLabel: string;
};

export type FunctionCallSpec = {
  name: FunctionCallToolName;
  label: string;
  description: string;
  executor: FunctionCallExecutor;
  sideEffectLevel: FunctionCallSideEffectLevel;
  timeoutMs: number;
  rollbackPolicy: "none" | "rollback_on_error" | "reset_on_error";
  display: ToolDisplayInfo;
};
