import {
  findForbiddenFixedAxisObjectCommands,
  findForbiddenTwoDimensionalStyleCommands,
  findForbiddenViewportScaleCommands,
  findGeoGebraCommandBatchPolicyViolations,
  fixedAxisObjectPolicyMessage,
  geogebraCommandBatchPolicyMessage,
  isFunctionCallArgs,
  repairViewportScaleCommand,
  twoDimensionalStylePolicyMessage,
  viewportScalePolicyMessage,
  type ExecuteGeoGebraCommandsArgs,
  type FunctionCallArgsByName,
  type FunctionCallToolName,
} from "@geochat-ai/app";

export type NativeToolPolicyContext = {
  prompt: string;
  locale?: "zh-CN" | "en-US" | null;
};

export function validateNativeToolInput<TToolName extends FunctionCallToolName>(
  toolName: TToolName,
  value: unknown,
  context: NativeToolPolicyContext,
): { success: true; value: FunctionCallArgsByName[TToolName] } | { success: false; error: Error } {
  if (!isFunctionCallArgs(toolName, value)) {
    return {
      success: false,
      error: new TypeError(`Invalid input for GeoChat tool ${toolName}.`),
    };
  }
  if (toolName !== "executeGeoGebraCommands") {
    return { success: true, value };
  }

  const fixedAxisViolations = findForbiddenFixedAxisObjectCommands(value);
  if (fixedAxisViolations.length) {
    return {
      success: false,
      error: new TypeError(fixedAxisObjectPolicyMessage(fixedAxisViolations, context.locale)),
    };
  }
  const batchViolations = findGeoGebraCommandBatchPolicyViolations(value);
  if (batchViolations.length) {
    return {
      success: false,
      error: new TypeError(geogebraCommandBatchPolicyMessage(batchViolations, context.locale)),
    };
  }
  return { success: true, value };
}

export function refineNativeToolInput<TToolName extends FunctionCallToolName>(
  toolName: TToolName,
  value: FunctionCallArgsByName[TToolName],
  context: NativeToolPolicyContext,
): FunctionCallArgsByName[TToolName] {
  if (toolName !== "executeGeoGebraCommands") return value;
  return refineExecuteGeoGebraCommands(value as ExecuteGeoGebraCommandsArgs, context) as FunctionCallArgsByName[TToolName];
}

export function refineExecuteGeoGebraCommands(
  value: ExecuteGeoGebraCommandsArgs,
  context: NativeToolPolicyContext,
): ExecuteGeoGebraCommandsArgs {
  const styleViolations = findForbiddenTwoDimensionalStyleCommands(value, { userPrompt: context.prompt });
  const forbiddenStyleCommands = new Set(styleViolations.map((violation) => violation.command));
  const viewportViolations = findForbiddenViewportScaleCommands(value);
  const forbiddenViewportCommands = new Set(viewportViolations.map((violation) => violation.command));
  const commands = value.commands
    .filter((command) => !forbiddenStyleCommands.has(command))
    .map((command) => forbiddenViewportCommands.has(command) ? repairViewportScaleCommand(command) ?? command : command);

  if (commands.length === value.commands.length && commands.every((command, index) => command === value.commands[index])) {
    return value;
  }

  const policyNotes = [
    styleViolations.length ? twoDimensionalStylePolicyMessage(styleViolations, context.locale) : "",
    viewportViolations.length ? viewportScalePolicyMessage(viewportViolations, context.locale) : "",
  ].filter(Boolean);
  const priorReason = typeof value.reason === "string" && value.reason.trim() ? `${value.reason.trim()} ` : "";
  return {
    ...value,
    commands,
    reason: `${priorReason}${policyNotes.join(" ")}`.trim(),
  };
}
