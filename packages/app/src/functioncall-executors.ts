import type { FunctionCallToolName } from "./functioncall-types";
import { getFunctionCallSpec, getFunctionCallToolNames } from "./functioncall-registry";

export function isFunctionCallRendererExecutable(toolName: FunctionCallToolName) {
  return getFunctionCallSpec(toolName).executor === "frontend";
}

export function isFunctionCallBackendExecutable(toolName: FunctionCallToolName) {
  return getFunctionCallSpec(toolName).executor === "backend";
}

export function getFunctionCallBackendExecutableToolNames() {
  return getFunctionCallToolNames().filter((toolName) => isFunctionCallBackendExecutable(toolName) && toolName !== "setFinished");
}

export function getFunctionCallPlanningToolNames() {
  return getFunctionCallToolNames();
}

export function getFunctionCallRemoteBridgeToolNames() {
  return getFunctionCallToolNames().filter(isFunctionCallRendererExecutable);
}
