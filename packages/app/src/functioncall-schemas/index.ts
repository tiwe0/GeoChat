import { CARD_FUNCTION_CALL_INPUT_JSON_SCHEMAS } from "./cards";
import { GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS } from "./geogebra";
import { MEMORY_FUNCTION_CALL_INPUT_JSON_SCHEMAS } from "./memory";
import { RUNNER_FUNCTION_CALL_INPUT_JSON_SCHEMAS } from "./runner";
import { SKILL_FUNCTION_CALL_INPUT_JSON_SCHEMAS } from "./skills";
import type { FunctionCallInputJsonSchemaMap } from "./types";

export const FUNCTION_CALL_INPUT_JSON_SCHEMAS = {
  searchGeoGebraCommands: GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS.searchGeoGebraCommands,
  readBlackboard: MEMORY_FUNCTION_CALL_INPUT_JSON_SCHEMAS.readBlackboard,
  patchBlackboard: MEMORY_FUNCTION_CALL_INPUT_JSON_SCHEMAS.patchBlackboard,
  listSkills: SKILL_FUNCTION_CALL_INPUT_JSON_SCHEMAS.listSkills,
  searchSkills: SKILL_FUNCTION_CALL_INPUT_JSON_SCHEMAS.searchSkills,
  loadSkill: SKILL_FUNCTION_CALL_INPUT_JSON_SCHEMAS.loadSkill,
  activateSkill: SKILL_FUNCTION_CALL_INPUT_JSON_SCHEMAS.activateSkill,
  createGeometryPlan: GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS.createGeometryPlan,
  executeAdvancedDrawingCommand: GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS.executeAdvancedDrawingCommand,
  executeGeoGebraCommands: GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS.executeGeoGebraCommands,
  resetCanvas: GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS.resetCanvas,
  getCanvasContext: GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS.getCanvasContext,
  getPNGBase64: GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS.getPNGBase64,
  showSolutionSteps: CARD_FUNCTION_CALL_INPUT_JSON_SCHEMAS.showSolutionSteps,
  showTeachingHint: CARD_FUNCTION_CALL_INPUT_JSON_SCHEMAS.showTeachingHint,
  showAnimationGuide: CARD_FUNCTION_CALL_INPUT_JSON_SCHEMAS.showAnimationGuide,
  showChoiceAnalysis: CARD_FUNCTION_CALL_INPUT_JSON_SCHEMAS.showChoiceAnalysis,
  showSelectedElements: CARD_FUNCTION_CALL_INPUT_JSON_SCHEMAS.showSelectedElements,
  setFinished: RUNNER_FUNCTION_CALL_INPUT_JSON_SCHEMAS.setFinished,
  setPerspective: GEOGEBRA_FUNCTION_CALL_INPUT_JSON_SCHEMAS.setPerspective
} as const satisfies FunctionCallInputJsonSchemaMap;
