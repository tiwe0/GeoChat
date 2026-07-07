import type { FunctionCallLocale } from "../functioncalls";
import { ADVANCED_DRAWING_TOOL_REGISTRY } from "./registry";
import { ADVANCED_DRAWING_TOOL_NAMES, isAdvancedDrawingToolName, type AdvancedDrawingCommandArgs } from "./types";
import { assertNoNestedAdvancedDrawingCommands } from "./validation";

export function getAdvancedDrawingToolDefinitions(names: readonly string[] | null | undefined = null) {
  const allowed = names?.length ? new Set(names.filter(isAdvancedDrawingToolName)) : null;
  return ADVANCED_DRAWING_TOOL_NAMES
    .filter((name) => !allowed || allowed.has(name))
    .map((name) => {
      const definition = ADVANCED_DRAWING_TOOL_REGISTRY[name];
      return {
        ...definition,
        requiredSkills: [...definition.requiredSkills],
        assumptions: [...definition.assumptions],
        parameters: definition.parameters.map((parameter) => ({ ...parameter })),
        invariants: [...definition.invariants]
      };
    });
}

export function compileAdvancedDrawingCommand(input: AdvancedDrawingCommandArgs, locale?: FunctionCallLocale | null) {
  assertNoNestedAdvancedDrawingCommands(input.args);
  const definition = ADVANCED_DRAWING_TOOL_REGISTRY[input.name];
  return definition.compile(input.args, locale);
}
