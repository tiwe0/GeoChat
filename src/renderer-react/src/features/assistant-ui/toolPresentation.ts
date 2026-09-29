import type { ToolCallMessagePartStatus } from "@assistant-ui/react";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";

const logger = createStructuredLogger("assistant.tool-presentation");

export const GEOCHAT_DISPLAY_TOOL_NAMES = [
  "showSolutionSteps",
  "showTeachingHint",
  "showAnimationGuide",
  "showChoiceAnalysis",
  "showSelectedElements",
] as const;

const GEOCHAT_DISPLAY_TOOLS = new Set<string>(GEOCHAT_DISPLAY_TOOL_NAMES);

export function isGeoChatDisplayToolName(toolName: string) {
  return GEOCHAT_DISPLAY_TOOLS.has(toolName);
}

export function assistantUiToolStatus(
  status: ToolCallMessagePartStatus,
  isError = false,
) {
  if (isError || status.type === "incomplete") return "failed" as const;
  if (status.type === "running" || status.type === "requires-action") return "running" as const;
  return "done" as const;
}

const REDACTED_VALUE = "[content omitted]";

function sanitizeToolValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[nested value]";
  if (typeof value === "string") {
    if (value.startsWith("data:") || value.length > 600) {
      return `${value.slice(0, 120)}… (${value.length} chars)`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeToolValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 30)
      .map(([key, item]) => [
        key,
        /(?:base64|imageData|fileData|binary|bytes)/i.test(key)
          ? REDACTED_VALUE
          : sanitizeToolValue(item, depth + 1),
      ]),
  );
}

export function formatToolPayload(value: unknown, maxLength = 4_000) {
  if (value === undefined) return "";
  try {
    const formatted = typeof value === "string"
      ? value
      : JSON.stringify(sanitizeToolValue(value), null, 2);
    return formatted.length > maxLength ? `${formatted.slice(0, maxLength)}\n…` : formatted;
  } catch (caughtError) {
    logger.debug("payload_format_failed", "ASSISTANT_TOOL_PAYLOAD_FORMAT_FAILED", { error: caughtError });
    return String(value);
  }
}

export function summarizeToolInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return formatToolPayload(value, 120).replace(/\s+/g, " ");
  }
  const record = value as Record<string, unknown>;
  const preferred = ["query", "command", "commands", "reason", "intendedOutcome", "name", "label"];
  for (const key of preferred) {
    const item = record[key];
    if (Array.isArray(item)) return `${key}: ${item.length}`;
    if (typeof item === "string" && item.trim()) {
      const compact = item.trim().replace(/\s+/g, " ");
      return compact.length > 92 ? `${compact.slice(0, 92)}…` : compact;
    }
  }
  return formatToolPayload(record, 120).replace(/\s+/g, " ");
}
