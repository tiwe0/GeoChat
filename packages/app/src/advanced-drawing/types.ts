import type { ExecuteGeoGebraCommandsArgs, FunctionCallLocale } from "../functioncalls";

export const ADVANCED_DRAWING_TOOL_NAMES = [
  "drawTriangularPrismSkeleton",
  "drawSquarePyramidSkeleton",
  "drawTetrahedronCircumsphere",
  "drawTetrahedronInsphere",
  "drawUnitCircleTrigProjection",
  "drawParabolaFocusDirectrix",
  "drawQuadraticVertexDiagram",
  "drawClassicalProbabilityGrid"
] as const;

export type AdvancedDrawingToolName = (typeof ADVANCED_DRAWING_TOOL_NAMES)[number];

export type AdvancedDrawingCommandArgs = {
  name: AdvancedDrawingToolName;
  args?: Record<string, unknown> | null;
  reason?: string | null;
  intendedOutcome?: string | null;
  nextExpectedAction?: string | null;
};

export type AdvancedDrawingExpressionEvaluation = "dynamic" | "snapshot";

export type AdvancedDrawingGeoGebraExpressionArg = {
  kind: "ggb_expr";
  expr: string;
  evaluation?: AdvancedDrawingExpressionEvaluation;
};

export type AdvancedDrawingObjectReferenceArg = {
  kind: "object_ref";
  name: string;
};

export type AdvancedDrawingToolMetadata = {
  name: AdvancedDrawingToolName;
  title: string;
  description: string;
  requiredSkills: string[];
  assumptions: string[];
  parameters: AdvancedDrawingParameterSpec[];
  invariants: string[];
};

export type AdvancedDrawingToolDefinition = AdvancedDrawingToolMetadata & {
  compile: (input: Record<string, unknown> | null | undefined, locale?: FunctionCallLocale | null) => AdvancedDrawingCompilation;
};

export type AdvancedDrawingParameterSpec = {
  name: string;
  kind: "number" | "integer" | "identifier" | "point3d-list" | "ggb_expr";
  required?: boolean;
  description: string;
};

export type AdvancedDrawingCompilation = {
  name: AdvancedDrawingToolName;
  title: string;
  executeArgs: ExecuteGeoGebraCommandsArgs;
  expectedObjects: string[];
  assumptions: string[];
  invariants: string[];
  readbackHints: string[];
};

export function isAdvancedDrawingToolName(value: string): value is AdvancedDrawingToolName {
  return (ADVANCED_DRAWING_TOOL_NAMES as readonly string[]).includes(value);
}
