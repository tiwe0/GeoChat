import { describe, expect, test } from "bun:test";
import {
  getFunctionCallInputJsonSchema,
  getFunctionCallModelInputJsonSchema,
  getFunctionCallToolNames
} from "../packages/app/src";

type SchemaShape = {
  required: string[];
  properties: string[];
  modelRequired: string[];
};

const expectedSchemaShapes = {
  searchGeoGebraCommands: {
    required: ["query", "scope"],
    properties: ["query", "scope", "topN", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["query", "scope", "reason"]
  },
  readBlackboard: {
    required: [],
    properties: ["categories", "includeArchived", "limit", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["reason"]
  },
  patchBlackboard: {
    required: ["ops"],
    properties: ["ops", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["ops", "reason"]
  },
  listSkills: {
    required: [],
    properties: ["category", "source", "limit", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["reason"]
  },
  searchSkills: {
    required: ["query"],
    properties: ["query", "category", "tags", "limit", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["query", "reason"]
  },
  loadSkill: {
    required: ["name"],
    properties: ["name", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["name", "reason"]
  },
  activateSkill: {
    required: ["name"],
    properties: ["name", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["name", "reason"]
  },
  createGeometryPlan: {
    required: ["recipeId"],
    properties: ["recipeId", "inputs", "sourceText", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["recipeId", "reason"]
  },
  executeAdvancedDrawingCommand: {
    required: ["name"],
    properties: ["name", "args", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["name", "reason"]
  },
  executeGeoGebraCommands: {
    required: ["commands"],
    properties: ["commands", "perspective", "resetBefore", "restoreOnError", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["commands", "reason"]
  },
  resetCanvas: {
    required: [],
    properties: ["perspective", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["reason"]
  },
  getCanvasContext: {
    required: [],
    properties: ["includeXml", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["reason"]
  },
  getPNGBase64: {
    required: [],
    properties: ["exportScale", "transparent", "dpi", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["reason"]
  },
  showSolutionSteps: {
    required: ["title", "answer", "steps"],
    properties: ["title", "answer", "summary", "auxiliaryElementReview", "steps", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["title", "answer", "steps", "reason"]
  },
  showTeachingHint: {
    required: ["title", "summary"],
    properties: ["title", "summary", "items", "auxiliaryElementReview", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["title", "summary", "reason"]
  },
  showAnimationGuide: {
    required: ["title", "summary"],
    properties: ["title", "summary", "controls", "observations", "auxiliaryElementReview", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["title", "summary", "reason"]
  },
  showChoiceAnalysis: {
    required: ["title", "summary", "choices"],
    properties: ["title", "summary", "answer", "baseConditions", "displayMode", "choices", "auxiliaryElementReview", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["title", "summary", "choices", "reason"]
  },
  showSelectedElements: {
    required: ["title", "summary", "elements"],
    properties: ["title", "summary", "elements", "nextActionHint", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["title", "summary", "elements", "reason"]
  },
  setFinished: {
    required: ["summary"],
    properties: ["summary", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["summary", "reason"]
  },
  setPerspective: {
    required: [],
    properties: ["mode", "perspective", "reason", "intendedOutcome", "nextExpectedAction"],
    modelRequired: ["reason"]
  }
} satisfies Record<string, SchemaShape>;

describe("function-call input schemas", () => {
  test("keep each tool's top-level schema shape stable", () => {
    const actualShapes = Object.fromEntries(
      getFunctionCallToolNames().map((toolName) => {
        const schema = getFunctionCallInputJsonSchema(toolName);
        const modelSchema = getFunctionCallModelInputJsonSchema(toolName, "zh-CN");
        return [
          toolName,
          {
            required: schema.required ?? [],
            properties: Object.keys(schema.properties),
            modelRequired: modelSchema.required ?? []
          }
        ];
      })
    );

    expect(actualShapes).toEqual(expectedSchemaShapes);
  });
});
