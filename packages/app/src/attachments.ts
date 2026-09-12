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

/**
 * Attachment limits, shared by the renderer's composer and the backend's
 * validation so the two cannot disagree about what will be rejected.
 */
export const MAX_AGENT_ATTACHMENT_COUNT = 4;
export const MAX_AGENT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_AGENT_ATTACHMENTS_TOTAL_BYTES = 20 * 1024 * 1024;
