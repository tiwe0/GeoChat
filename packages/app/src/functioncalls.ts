import type { PatchBlackboardArgs, ReadBlackboardArgs } from "./blackboard";
import type { GeoGebraCommandSearchScope } from "./geogebra-command-reference";
import type { AdvancedDrawingCommandArgs } from "./advanced-drawing-tools";
import type { FunctionCallStatus, FunctionCallToolName } from "./functioncall-types";

export type {
  FunctionCallExecutor,
  FunctionCallLocale,
  FunctionCallSideEffectLevel,
  FunctionCallSpec,
  FunctionCallStatus,
  FunctionCallToolName,
  ToolDisplayInfo
} from "./functioncall-types";
export {
  FUNCTION_CALL_REGISTRY,
  getFunctionCallSpec,
  getFunctionCallToolNames,
  isFunctionCallToolName,
  localizedFunctionCallSpec
} from "./functioncall-registry";
export {
  getFunctionCallBackendExecutableToolNames,
  getFunctionCallPlanningToolNames,
  getFunctionCallRemoteBridgeToolNames,
  isFunctionCallBackendExecutable,
  isFunctionCallRendererExecutable
} from "./functioncall-executors";
export { getFunctionCallDisplayInfo, getFunctionCallStatusLabel } from "./functioncall-display";

export type FunctionCallAuditFields = {
  reason?: string | null;
  intendedOutcome?: string | null;
  nextExpectedAction?: string | null;
};

export type SearchGeoGebraCommandsArgs = FunctionCallAuditFields & {
  query: string;
  scope: GeoGebraCommandSearchScope;
  topN?: number | null;
};

export type ExecuteGeoGebraCommandsArgs = FunctionCallAuditFields & {
  commands: string[];
  perspective?: string | null;
  resetBefore?: boolean | null;
  restoreOnError?: boolean | null;
};

export type ResetCanvasArgs = FunctionCallAuditFields & {
  perspective?: string | null;
};

export type CreateGeometryPlanArgs = FunctionCallAuditFields & {
  recipeId: string;
  inputs?: Record<string, unknown> | null;
  sourceText?: string | null;
};

export type ExecuteAdvancedDrawingCommandArgs = AdvancedDrawingCommandArgs;

export type ListSkillsArgs = FunctionCallAuditFields & {
  category?: string | null;
  source?: "built-in" | "local" | "remote" | null;
  limit?: number | null;
};

export type SearchSkillsArgs = FunctionCallAuditFields & {
  query: string;
  category?: string | null;
  tags?: string[] | null;
  limit?: number | null;
};

export type ActivateSkillArgs = FunctionCallAuditFields & {
  name: string;
};

export type LoadSkillArgs = ActivateSkillArgs;

export type GetCanvasContextArgs = FunctionCallAuditFields & {
  includeXml?: boolean | null;
};

export type GetPNGBase64Args = FunctionCallAuditFields & {
  exportScale?: number | null;
  transparent?: boolean | null;
  dpi?: number | null;
};

export type ShowSolutionStepsArgs = FunctionCallAuditFields & {
  title: string;
  answer: string;
  steps: Array<{ label: string; body: string }>;
  summary?: string | null;
  auxiliaryElementReview?: string | null;
};

export type ShowTeachingHintArgs = FunctionCallAuditFields & {
  title: string;
  summary: string;
  items?: string[] | null;
  auxiliaryElementReview?: string | null;
};

export type ShowAnimationGuideArgs = FunctionCallAuditFields & {
  title: string;
  summary: string;
  controls?: string[] | null;
  observations?: string[] | null;
  auxiliaryElementReview?: string | null;
};

export type ChoiceAnalysisChoice = {
  label: "A" | "B" | "C" | "D";
  statement: string;
  verdict: "true" | "false" | "unknown";
  explanation: string;
  constructionFocus?: string | null;
  evidence?: string[] | null;
  commands?: string[] | null;
};

export type ShowChoiceAnalysisArgs = FunctionCallAuditFields & {
  title: string;
  summary: string;
  answer?: string | null;
  baseConditions?: string[] | null;
  displayMode?: "single_active_choice" | "compare_choices" | "text_only" | null;
  choices: ChoiceAnalysisChoice[];
  auxiliaryElementReview?: string | null;
};

export type ShowSelectedElementsArgs = FunctionCallAuditFields & {
  title: string;
  summary: string;
  elements: Array<{
    label: string;
    type?: string | null;
    description?: string | null;
    role?: string | null;
  }>;
  nextActionHint?: string | null;
};

export type SetFinishedArgs = FunctionCallAuditFields & {
  summary: string;
};

export type SetPerspectiveArgs = FunctionCallAuditFields & {
  mode?: string | null;
  perspective?: string | null;
};

export {
  normalizeGeoGebraFreeParameterCommands,
  normalizeGeoGebraPerspectiveMode,
  type NormalizedGeoGebraPerspectiveMode
} from "./geogebra-command-normalization";

export type FunctionCallArgsByName = {
  searchGeoGebraCommands: SearchGeoGebraCommandsArgs;
  readBlackboard: ReadBlackboardArgs;
  patchBlackboard: PatchBlackboardArgs;
  listSkills: ListSkillsArgs;
  searchSkills: SearchSkillsArgs;
  loadSkill: LoadSkillArgs;
  activateSkill: ActivateSkillArgs;
  createGeometryPlan: CreateGeometryPlanArgs;
  executeAdvancedDrawingCommand: ExecuteAdvancedDrawingCommandArgs;
  executeGeoGebraCommands: ExecuteGeoGebraCommandsArgs;
  resetCanvas: ResetCanvasArgs;
  getCanvasContext: GetCanvasContextArgs;
  getPNGBase64: GetPNGBase64Args;
  showSolutionSteps: ShowSolutionStepsArgs;
  showTeachingHint: ShowTeachingHintArgs;
  showAnimationGuide: ShowAnimationGuideArgs;
  showChoiceAnalysis: ShowChoiceAnalysisArgs;
  showSelectedElements: ShowSelectedElementsArgs;
  setFinished: SetFinishedArgs;
  setPerspective: SetPerspectiveArgs;
};

export type DesktopFunctionCall<TToolName extends FunctionCallToolName = FunctionCallToolName> = {
  id: string;
  callId: string;
  toolName: TToolName;
  args: FunctionCallArgsByName[TToolName];
  status: FunctionCallStatus;
  result?: unknown;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ToolExecutionResult = {
  ok: boolean;
  results: Array<{ command: string; success: boolean; error?: string | null }>;
  result?: unknown;
  canvasContext?: unknown;
  canvasBefore?: unknown;
  canvasAfter?: unknown;
  clientMeta?: Record<string, unknown>;
  error?: string | null;
};
