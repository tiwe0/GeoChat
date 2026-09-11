import type { FileUIPart } from "ai";
import {
  MAX_AGENT_ATTACHMENT_BYTES,
  MAX_AGENT_ATTACHMENT_COUNT,
  MAX_AGENT_ATTACHMENTS_TOTAL_BYTES,
  isOptionalAgentRunImageAttachments,
} from "@geogebra-copilot/shared/contracts";

export const MAX_AGENT_FILE_COUNT = MAX_AGENT_ATTACHMENT_COUNT;
export const MAX_AGENT_FILE_SIZE = MAX_AGENT_ATTACHMENT_BYTES;
export const MAX_AGENT_TOTAL_FILE_SIZE = MAX_AGENT_ATTACHMENTS_TOTAL_BYTES;
export const AGENT_ATTACHMENT_ACCEPT = "image/*";

export type AgentAttachmentValidationError = "unsupported" | "too_large" | "too_many" | "total_too_large";

export function isSupportedAgentFile(file: Pick<File, "type">) {
  return file.type.startsWith("image/");
}

export function areSupportedAgentAttachments(files: FileUIPart[]) {
  return isOptionalAgentRunImageAttachments(files.map((file) => ({
    name: file.filename ?? "image",
    mediaType: file.mediaType,
    dataUrl: file.url,
  })));
}

export function validateAgentFiles(
  files: Iterable<Pick<File, "type" | "size">>,
  existing: { count: number; totalSize: number },
): { accepted: number; error: AgentAttachmentValidationError | null } {
  let accepted = 0;
  let totalSize = existing.totalSize;
  let error: AgentAttachmentValidationError | null = null;
  for (const file of files) {
    if (!isSupportedAgentFile(file)) {
      error ??= "unsupported";
      continue;
    }
    if (file.size > MAX_AGENT_FILE_SIZE) {
      error ??= "too_large";
      continue;
    }
    if (existing.count + accepted >= MAX_AGENT_FILE_COUNT) {
      error ??= "too_many";
      break;
    }
    if (totalSize + file.size > MAX_AGENT_TOTAL_FILE_SIZE) {
      error ??= "total_too_large";
      continue;
    }
    accepted += 1;
    totalSize += file.size;
  }
  return { accepted, error };
}
