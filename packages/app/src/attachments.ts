export type AgentRunImageAttachment = {
  name: string;
  mediaType: string;
  dataUrl: string;
};

export function isAgentRunImageAttachment(value: unknown): value is AgentRunImageAttachment {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.name === "string" &&
    typeof payload.mediaType === "string" &&
    payload.mediaType.startsWith("image/") &&
    typeof payload.dataUrl === "string" &&
    payload.dataUrl.length > 0
  );
}

export function isOptionalAgentRunImageAttachments(value: unknown): value is AgentRunImageAttachment[] | undefined {
  return value === undefined || (Array.isArray(value) && value.length <= 4 && value.every(isAgentRunImageAttachment));
}
