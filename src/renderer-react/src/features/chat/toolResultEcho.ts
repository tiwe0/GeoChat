type MessagePartLike = {
  type?: unknown;
  state?: unknown;
  text?: unknown;
  output?: unknown;
};

/**
 * Defense in depth for provider protocol failures: an assistant must never
 * render a verbatim tool payload as if it were a user-facing answer.
 */
export function isInternalToolResultEcho(parts: readonly unknown[], textIndex: number) {
  const current = messagePart(parts[textIndex]);
  if (current?.type !== "text" || typeof current.text !== "string") return false;
  const parsedText = parseJsonText(current.text);
  if (parsedText === undefined) return false;

  for (let index = textIndex - 1; index >= 0; index -= 1) {
    const candidate = messagePart(parts[index]);
    if (!candidate || typeof candidate.type !== "string" || !candidate.type.startsWith("tool-")) continue;
    if (candidate.state !== "output-available" || candidate.output === undefined) return false;
    try {
      return JSON.stringify(parsedText) === JSON.stringify(candidate.output);
    } catch (caughtError) {
      console.error("[ERROR] Failed to compare a rendered tool-result echo", caughtError);
      return false;
    }
  }
  return false;
}

function messagePart(value: unknown): MessagePartLike | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as MessagePartLike
    : undefined;
}

function parseJsonText(text: string) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!normalized || (normalized[0] !== "{" && normalized[0] !== "[")) return undefined;
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    return undefined;
  }
}
