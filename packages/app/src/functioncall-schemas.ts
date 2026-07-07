import type { FunctionCallArgsByName } from "./functioncalls";
import type { FunctionCallLocale, FunctionCallToolName } from "./functioncall-types";
import { FUNCTION_CALL_INPUT_JSON_SCHEMAS } from "./functioncall-schemas/index";
import { auxiliaryElementReviewDescriptionEn, executeCommandsDescriptionEn } from "./functioncall-schemas/shared";
import type {
  FunctionCallInputJsonSchema,
  FunctionCallInputJsonSchemaOptions,
  JsonSchemaProperty
} from "./functioncall-schemas/types";

export { FUNCTION_CALL_INPUT_JSON_SCHEMAS } from "./functioncall-schemas/index";
export type {
  FunctionCallInputJsonSchema,
  FunctionCallInputJsonSchemaOptions,
  JsonSchemaProperty
} from "./functioncall-schemas/types";

const auditPropertiesEn = {
  reason: { type: "string", nullable: true, description: "Required. Explain why this tool call is needed at this moment, including the decision basis for this turn." },
  intendedOutcome: { type: "string", nullable: true, description: "Explain the concrete result expected from this tool call." },
  nextExpectedAction: { type: "string", nullable: true, description: "Explain the expected next action after the tool completes." }
} as const satisfies Record<string, JsonSchemaProperty>;

const FUNCTION_CALL_INPUT_JSON_SCHEMA_ENGLISH_OVERRIDES = {
  searchGeoGebraCommands: {
    query: "GeoGebra command search keywords. Prefer the user's construction intent in English when the UI language is English.",
    scope: "Required search scope. Pass global explicitly for broad lookup; use a narrower scope when the intended construction domain is known."
  },
  readBlackboard: {
    categories: "Read only these blackboard categories. When omitted, read all active entries."
  },
  patchBlackboard: {
    ops: "Controlled blackboard patch operations. Save only durable context needed for later reasoning or drawing, such as original problem, givens, goal, math conclusions, construction plan, failed attempts, and teaching notes."
  },
  listSkills: {
    category: "Optional skill category filter, for example high-school-solid-geometry.",
    source: "Optional skill source filter.",
    limit: "Maximum number of skill summaries to return."
  },
  searchSkills: {
    query: "Skill search keywords from the problem topic, math domain, construction goal, or explanation goal.",
    category: "Optional category filter.",
    tags: "Optional tags to prioritize.",
    limit: "Maximum number of matching skills to return."
  },
  loadSkill: {
    name: "Skill name to load. It must come from listSkills or searchSkills results; pass a name, not a path, and do not invent missing skills."
  },
  activateSkill: {
    name: "Compatibility alias for loadSkill. Prefer listSkills, searchSkills, then loadSkill for new calls."
  },
  createGeometryPlan: {
    recipeId: "Construction recipe ID, for example function.parabola.vertex, function.intersections, or conic.ellipse.foci-point.",
    inputs: "Structured inputs for the recipe, such as expressions, focus coordinates, or object names.",
    sourceText: "Original problem statement or local problem text. The backend conservatively extracts expressions, coordinates, and recipe parameters from it."
  },
  executeAdvancedDrawingCommand: {
    name: "Advanced drawing command name. Use only commands unlocked by the loaded skills and listed in the current skill packet.",
    args: "Structured arguments for the advanced drawing command. Numbers are backend compile-time literals; object-name fields are GeoGebra symbols; expressions must be tagged as { kind: \"ggb_expr\", expr: \"...\", evaluation: \"dynamic\" | \"snapshot\" }. dynamic preserves GeoGebra dependencies; snapshot compiles through CopyFreeObject(expr). Nested advanced drawing commands are forbidden."
  },
  executeGeoGebraCommands: {
    commands: executeCommandsDescriptionEn
  },
  resetCanvas: {
    perspective: "Optional GeoGebra SetPerspective view or layout to switch to after reset. Defaults to G for Graphics; use T for 3D Graphics."
  },
  showChoiceAnalysis: {
    title: "Choice analysis card title.",
    summary: "Summarize the shared stem conditions first, and explain how they form the common base construction for every choice.",
    answer: "Final selected option labels, such as A, BD, or ACD; explain if the answer cannot be determined.",
    baseConditions: "Shared conditions from the problem stem. Do not include a choice-specific claim here.",
    displayMode: "Recommended display mode. For choice or multiple-choice prompts, default to single_active_choice and do not use text_only to avoid option-level canvas scenarios. single_active_choice means the main canvas should focus on one choice at a time; compare_choices means text or small previews can compare choices; text_only is only for cards that truly do not need canvas switching.",
    choices: "Analyze A/B/C/D separately. Do not mix the construction, reasoning, or verdict for multiple choices into one choice item.",
    auxiliaryElementReview: auxiliaryElementReviewDescriptionEn,
    choiceFields: {
      label: "Choice label.",
      statement: "The original claim or statement for this choice.",
      verdict: "true=correct, false=incorrect, unknown=not directly confirmed by the current information or canvas.",
      explanation: "Reasoning for this choice only, explaining how it follows from the shared conditions or is refuted by a counterexample.",
      constructionFocus: "The choice-specific auxiliary construction or canvas layer to highlight, such as A_aux1 or B_mark1. This must be non-empty for choice or multiple-choice prompts.",
      evidence: "Key math facts, canvas objects, or verification results supporting this verdict.",
      commands: "Executable GeoGebra commands for this choice scenario only, starting from the shared base construction. This must be non-empty for choice or multiple-choice prompts. When the user selects the choice, the frontend restores the base canvas and runs these commands. Do not include commands for other choices or reference objects private to another choice. For parameter-based choices, prefer parameter-domain slices, level curves, special-value/counterexample lines, extrema slices, or verification objects."
    }
  },
  showSelectedElements: {
    title: "Selected elements card title.",
    summary: "Summarize which canvas objects the user has currently selected, and state that follow-up requests will refer to these objects by default.",
    elements: "Objects currently selected by the user in the GeoGebra canvas. label must be the real GeoGebra object name, such as A, lineAB, or poly1.",
    elementFields: {
      label: "GeoGebra object name.",
      type: "Object type, such as point, line, segment, polygon, circle, or function.",
      description: "What this object means in the current problem or canvas.",
      role: "How follow-up requests should refer to it, such as point to move, segment to modify, or object to verify."
    },
    nextActionHint: "Tell the user they can continue by asking to move, delete, rename, or construct around these selected objects."
  },
  setFinished: {
    summary: "Final concise user-facing summary for this run. Call only after canvas construction, verification, and required explanation are complete."
  },
  setPerspective: {
    mode: [
      "GeoGebra SetPerspective text, code, layout, toggle, or supported alias.",
      "View letters: A=Algebra, B=Probability Calculator, C=CAS, D=Graphics 2, G=Graphics, L=Construction Protocol, P=Properties, R=Data Analysis, S=Spreadsheet, T=3D Graphics.",
      "Use T for 3D Graphics; do not pass 3D unless relying on alias normalization.",
      "Examples: G, AG, AGS, S/G, S/(GA), +D, -D, +T, -T, +Tools, +Table, 1, 2, 3, 4, 5, 6.",
      "Localized aliases are accepted and normalized before execution."
    ].join(" "),
    perspective: "Alias of mode for compatibility. Prefer mode for new calls and follow the same GeoGebra SetPerspective usage rules."
  }
} as const;

function cloneFunctionCallInputJsonSchema<TToolName extends FunctionCallToolName>(toolName: TToolName): FunctionCallInputJsonSchema {
  return structuredClone(FUNCTION_CALL_INPUT_JSON_SCHEMAS[toolName]) as FunctionCallInputJsonSchema;
}

function withAuditDescriptions(schema: FunctionCallInputJsonSchema, locale?: FunctionCallLocale | null) {
  if (locale !== "en-US") return schema;
  for (const [key, property] of Object.entries(auditPropertiesEn)) {
    schema.properties[key] = { ...schema.properties[key], description: property.description };
  }
  return schema;
}

function withRequiredReason(schema: FunctionCallInputJsonSchema) {
  const required = schema.required ?? [];
  if (!required.includes("reason")) {
    schema.required = [...required, "reason"];
  }
  return schema;
}

function localizedFunctionCallInputJsonSchema<TToolName extends FunctionCallToolName>(
  toolName: TToolName,
  locale?: FunctionCallLocale | null
): FunctionCallInputJsonSchema {
  const schema = withAuditDescriptions(cloneFunctionCallInputJsonSchema(toolName), locale);
  if (locale !== "en-US") return schema;
  const overrides = FUNCTION_CALL_INPUT_JSON_SCHEMA_ENGLISH_OVERRIDES;
  if (toolName === "searchGeoGebraCommands") {
    schema.properties.query = { ...schema.properties.query, description: overrides.searchGeoGebraCommands.query };
    schema.properties.scope = { ...schema.properties.scope, description: overrides.searchGeoGebraCommands.scope };
  }
  if (toolName === "readBlackboard") {
    schema.properties.categories = { ...schema.properties.categories, description: overrides.readBlackboard.categories };
  }
  if (toolName === "patchBlackboard") {
    schema.properties.ops = { ...schema.properties.ops, description: overrides.patchBlackboard.ops };
  }
  if (toolName === "listSkills") {
    schema.properties.category = { ...schema.properties.category, description: overrides.listSkills.category };
    schema.properties.source = { ...schema.properties.source, description: overrides.listSkills.source };
    schema.properties.limit = { ...schema.properties.limit, description: overrides.listSkills.limit };
  }
  if (toolName === "searchSkills") {
    schema.properties.query = { ...schema.properties.query, description: overrides.searchSkills.query };
    schema.properties.category = { ...schema.properties.category, description: overrides.searchSkills.category };
    schema.properties.tags = { ...schema.properties.tags, description: overrides.searchSkills.tags };
    schema.properties.limit = { ...schema.properties.limit, description: overrides.searchSkills.limit };
  }
  if (toolName === "loadSkill") {
    schema.properties.name = { ...schema.properties.name, description: overrides.loadSkill.name };
  }
  if (toolName === "activateSkill") {
    schema.properties.name = { ...schema.properties.name, description: overrides.activateSkill.name };
  }
  if (toolName === "createGeometryPlan") {
    schema.properties.recipeId = { ...schema.properties.recipeId, description: overrides.createGeometryPlan.recipeId };
    schema.properties.inputs = { ...schema.properties.inputs, description: overrides.createGeometryPlan.inputs };
    schema.properties.sourceText = { ...schema.properties.sourceText, description: overrides.createGeometryPlan.sourceText };
  }
  if (toolName === "executeAdvancedDrawingCommand") {
    schema.properties.name = { ...schema.properties.name, description: overrides.executeAdvancedDrawingCommand.name };
    schema.properties.args = { ...schema.properties.args, description: overrides.executeAdvancedDrawingCommand.args };
  }
  if (toolName === "executeGeoGebraCommands") {
    schema.properties.commands = { ...schema.properties.commands, description: overrides.executeGeoGebraCommands.commands };
  }
  if (toolName === "resetCanvas") {
    schema.properties.perspective = { ...schema.properties.perspective, description: overrides.resetCanvas.perspective };
  }
  if (toolName === "showSolutionSteps" || toolName === "showTeachingHint" || toolName === "showAnimationGuide") {
    schema.properties.auxiliaryElementReview = {
      ...schema.properties.auxiliaryElementReview,
      description: auxiliaryElementReviewDescriptionEn
    };
  }
  if (toolName === "showChoiceAnalysis") {
    schema.properties.title = { ...schema.properties.title, description: overrides.showChoiceAnalysis.title };
    schema.properties.summary = { ...schema.properties.summary, description: overrides.showChoiceAnalysis.summary };
    schema.properties.answer = { ...schema.properties.answer, description: overrides.showChoiceAnalysis.answer };
    schema.properties.baseConditions = { ...schema.properties.baseConditions, description: overrides.showChoiceAnalysis.baseConditions };
    schema.properties.displayMode = { ...schema.properties.displayMode, description: overrides.showChoiceAnalysis.displayMode };
    schema.properties.auxiliaryElementReview = {
      ...schema.properties.auxiliaryElementReview,
      description: overrides.showChoiceAnalysis.auxiliaryElementReview
    };
    schema.properties.choices = { ...schema.properties.choices, description: overrides.showChoiceAnalysis.choices };
    const choiceProperties = schema.properties.choices.items?.properties;
    if (choiceProperties) {
      for (const [key, description] of Object.entries(overrides.showChoiceAnalysis.choiceFields)) {
        const property = choiceProperties[key];
        if (property) choiceProperties[key] = { ...property, description };
      }
    }
  }
  if (toolName === "showSelectedElements") {
    schema.properties.title = { ...schema.properties.title, description: overrides.showSelectedElements.title };
    schema.properties.summary = { ...schema.properties.summary, description: overrides.showSelectedElements.summary };
    schema.properties.elements = { ...schema.properties.elements, description: overrides.showSelectedElements.elements };
    schema.properties.nextActionHint = { ...schema.properties.nextActionHint, description: overrides.showSelectedElements.nextActionHint };
    const elementProperties = schema.properties.elements.items?.properties;
    if (elementProperties) {
      for (const [key, description] of Object.entries(overrides.showSelectedElements.elementFields)) {
        const property = elementProperties[key];
        if (property) elementProperties[key] = { ...property, description };
      }
    }
  }
  if (toolName === "setPerspective") {
    schema.properties.mode = { ...schema.properties.mode, description: overrides.setPerspective.mode };
    schema.properties.perspective = { ...schema.properties.perspective, description: overrides.setPerspective.perspective };
  }
  return schema;
}

export function getFunctionCallInputJsonSchema<TToolName extends FunctionCallToolName>(
  toolName: TToolName,
  locale?: FunctionCallLocale | null,
  options?: FunctionCallInputJsonSchemaOptions
) {
  const schema = localizedFunctionCallInputJsonSchema(toolName, locale);
  return options?.requireReason ? withRequiredReason(schema) : schema;
}

export function getFunctionCallModelInputJsonSchema<TToolName extends FunctionCallToolName>(toolName: TToolName, locale?: FunctionCallLocale | null) {
  return getFunctionCallInputJsonSchema(toolName, locale, { requireReason: true });
}

export function isFunctionCallArgs<TToolName extends FunctionCallToolName>(
  toolName: TToolName,
  value: unknown
): value is FunctionCallArgsByName[TToolName] {
  return validateJsonSchemaValue(getFunctionCallInputJsonSchema(toolName), value);
}

function validateJsonSchemaValue(schema: JsonSchemaProperty | FunctionCallInputJsonSchema, value: unknown): boolean {
  if (value === null) return Boolean("nullable" in schema && schema.nullable);
  if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    return schema.items ? value.every((item) => validateJsonSchemaValue(schema.items!, item)) : true;
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false && Object.keys(object).some((key) => !(key in properties))) return false;
    if (schema.required?.some((key) => !(key in object))) return false;
    return Object.entries(object).every(([key, item]) => {
      const childSchema = properties[key];
      return childSchema ? validateJsonSchemaValue(childSchema, item) : schema.additionalProperties !== false;
    });
  }
  if (schema.type === "string") {
    return (
      typeof value === "string" &&
      (schema.minLength === undefined || value.length >= schema.minLength) &&
      (schema.enum === undefined || schema.enum.includes(value))
    );
  }
  if (schema.type === "number") {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (schema.minimum === undefined || value >= schema.minimum) &&
      (schema.maximum === undefined || value <= schema.maximum)
    );
  }
  if (schema.type === "boolean") return typeof value === "boolean";
  return false;
}
