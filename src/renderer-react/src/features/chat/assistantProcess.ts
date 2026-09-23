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

export function collectAssistantProcessRuns(
  parts: readonly unknown[],
  isDisplayTool: (part: unknown) => boolean,
  shouldIgnorePart: (part: unknown, index: number) => boolean = () => false,
): AssistantProcess[] {
  const runs: AssistantProcess[] = [];
  let entries: AssistantProcess["entries"] = [];

  const flush = () => {
    if (!entries.length) return;
    const lastIndex = entries.at(-1)!.index;
    runs.push({
      entries,
      firstIndex: entries[0].index,
      hasFailure: entries.some(({ part }) => part.type.startsWith("tool-") && assistantToolStatus(part) === "failed"),
      hasFinalContent: parts.some((candidate, candidateIndex) => {
        if (candidateIndex <= lastIndex || shouldIgnorePart(candidate, candidateIndex)) return false;
        const laterPart = asPart(candidate);
        if (!laterPart) return false;
        if (laterPart.type === "text") return Boolean(laterPart.text?.trim());
        if (laterPart.type === "file") return true;
        return laterPart.type.startsWith("tool-") && isDisplayTool(laterPart);
      }),
      reasoningCount: entries.filter(({ part }) => part.type === "reasoning").length,
      toolCount: entries.filter(({ part }) => part.type.startsWith("tool-")).length,
    });
    entries = [];
  };

  parts.forEach((value, index) => {
    if (shouldIgnorePart(value, index)) return;
    const part = asPart(value);
    if (!part) return;

    if (part.type === "reasoning") {
      if (part.text?.trim()) {
        entries.push({ index, part });
      }
      return;
    }

    if (part.type.startsWith("tool-")) {
      if (isDisplayTool(part)) {
        flush();
        return;
      }
      entries.push({ index, part });
      return;
    }

    if ((part.type === "text" && part.text?.trim()) || part.type === "file") flush();
  });

  flush();
  return runs;
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
