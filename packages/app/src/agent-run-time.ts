export function isAgentRunTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

export function isOptionalAgentRunTimestamp(value: unknown): value is string | undefined {
  return value === undefined || isAgentRunTimestamp(value);
}

export function isOptionalAgentRunTimestampOrNull(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isAgentRunTimestamp(value);
}
