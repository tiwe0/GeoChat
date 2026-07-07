import type { FunctionCallLocale, FunctionCallStatus, FunctionCallToolName, ToolDisplayInfo } from "./functioncall-types";
import { getFunctionCallSpec } from "./functioncall-registry";

export function getFunctionCallDisplayInfo(toolName: FunctionCallToolName, locale?: FunctionCallLocale | null): ToolDisplayInfo {
  return getFunctionCallSpec(toolName, locale).display;
}

export function getFunctionCallStatusLabel(
  toolName: FunctionCallToolName,
  status: FunctionCallStatus,
  hasError = false,
  locale?: FunctionCallLocale | null
) {
  const info = getFunctionCallDisplayInfo(toolName, locale);
  if (hasError || status === "error") return info.error;
  if (status === "done") return info.done;
  return info.running;
}
