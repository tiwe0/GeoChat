export type AssistantProcessPart = {
  type: string;
  state?: string;
  text?: string;
  input?: unknown;
  output?: unknown;
  errorText?: unknown;
};

export type AssistantProcess = {
  entries: Array<{ index: number; part: AssistantProcessPart }>;
  firstIndex: number;
  hasFailure: boolean;
  hasFinalContent: boolean;
  reasoningCount: number;
  toolCount: number;
};

function asPart(value: unknown): AssistantProcessPart | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const part = value as Partial<AssistantProcessPart>;
  return typeof part.type === "string" ? part as AssistantProcessPart : null;
}

export function assistantToolStatus(part: AssistantProcessPart) {
  if (part.state === "output-available") return "done" as const;
  if (part.state === "output-error" || part.state === "output-denied") return "failed" as const;
  return "running" as const;
}

export function collectAssistantProcess(
  parts: readonly unknown[],
  isDisplayTool: (part: unknown) => boolean,
): AssistantProcess | null {
  const entries: AssistantProcess["entries"] = [];
  let reasoningCount = 0;
  let toolCount = 0;
  let hasFailure = false;
  let hasFinalContent = false;

  parts.forEach((value, index) => {
    const part = asPart(value);
    if (!part) return;

    if (part.type === "reasoning") {
      if (part.text?.trim()) {
        entries.push({ index, part });
        reasoningCount += 1;
      }
      return;
    }

    if (part.type.startsWith("tool-")) {
      if (isDisplayTool(part)) {
        hasFinalContent = true;
        return;
      }
      entries.push({ index, part });
      toolCount += 1;
      hasFailure ||= assistantToolStatus(part) === "failed";
      return;
    }

    if (part.type === "text" && part.text?.trim()) hasFinalContent = true;
    if (part.type === "file") hasFinalContent = true;
  });

  if (!entries.length) return null;
  return {
    entries,
    firstIndex: entries[0].index,
    hasFailure,
    hasFinalContent,
    reasoningCount,
    toolCount,
  };
}

export function shouldExpandAssistantProcess(process: AssistantProcess, active: boolean) {
  return active || process.hasFailure || !process.hasFinalContent;
}

const REDACTED_VALUE = "[content omitted]";

function sanitizeToolValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[nested value]";
  if (typeof value === "string") {
    if (value.startsWith("data:") || value.length > 600) return `${value.slice(0, 120)}… (${value.length} chars)`;
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
    console.error("[ERROR] Failed to format assistant tool payload", caughtError);
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
