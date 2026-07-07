export function isAgentRunEntityId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isAgentRunToolCallId(value: unknown): value is string {
  return isAgentRunEntityId(value);
}
