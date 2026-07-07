import type { FunctionCallToolName } from "@geochat-ai/app";
import { toolDisplayInfo } from "./functioncalls";
import { interpolate, type RendererI18n } from "./i18n";

export type ToolActivityState = "running" | "thinking";

export function toolActivityText(copy: RendererI18n, toolName: FunctionCallToolName, state: ToolActivityState) {
  if (state === "thinking") return copy.chat.backendToolSubmitted;
  return copy.chat.toolActivities[toolName] ?? interpolate(copy.chat.backendToolRunning, {
    tool: copy.tools.displays[toolName]?.label ?? toolDisplayInfo(toolName).label
  });
}

