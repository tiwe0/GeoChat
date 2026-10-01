import { isToolUIPart, type FileUIPart, type UIMessage } from "ai";
import type { AgentRunImageAttachment, AgentRunThinkingEffort } from "@geochat-ai/app/contracts";
import { agentModelSupportsReasoning, type AgentModelConfig } from "@geochat-ai/app/model-registry";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { CORRELATION_ID_HEADER, createCorrelationId } from "@geochat-ai/app/request-correlation";
import { promptWithSkillPolicy, readDesktopConfig } from "../../../../shared/desktop/desktop-config";
import type { DesktopConfig } from "../../../../shared/desktop/workbench-types";
import { areSupportedAgentAttachments } from "../attachments/capabilities";
import { desktopLogger } from "../desktop/desktopLogger";
import { getInstallationId } from "./activeRunStorage";

const logger = createStructuredLogger("agent-run.request");
const NATIVE_CHAT_NETWORK_RETRY_DELAYS_MS = [750, 1_500, 3_000] as const;

export type NativeRunRequestInput = {
  getAuthToken: () => string | null;
  getModelConfig?: () => AgentModelConfig;
  locale: "zh-CN" | "en-US";
  getThinking: () => boolean;
  getThinkingEffort: () => AgentRunThinkingEffort;
};

export type NativeRunRequestSnapshot = Readonly<{
  model: AgentModelConfig;
  locale: "zh-CN" | "en-US";
  thinking: boolean;
  thinkingEffort: AgentRunThinkingEffort;
  desktopConfig: DesktopConfig;
}>;

export type NativeRunSubmissionDraft = Readonly<{
  files: FileUIPart[];
  localAttachments: AgentRunImageAttachment[];
  prompt: string;
  text: string | undefined;
  snapshot: NativeRunRequestSnapshot;
}>;

export function captureNativeRunRequestSnapshot(
  input: NativeRunRequestInput,
  desktopConfig: DesktopConfig = readDesktopConfig(),
): NativeRunRequestSnapshot {
  const selectedModel = input.getModelConfig?.();
  if (!selectedModel) throw new Error("A model configuration is required.");
  const model = Object.freeze({ ...selectedModel });
  return Object.freeze({
    model,
    locale: input.locale,
    thinking: input.getThinking() && agentModelSupportsReasoning(model.provider, model.model),
    thinkingEffort: input.getThinkingEffort(),
    desktopConfig: structuredClone(desktopConfig),
  });
}

export function prepareNativeRunSubmission(
  message: { text?: string; files?: FileUIPart[] },
  input: NativeRunRequestInput,
  desktopConfig: DesktopConfig = readDesktopConfig(),
): NativeRunSubmissionDraft | null {
  const files = message.files ?? [];
  if (!areSupportedAgentAttachments(files)) {
    const unsupported = files.find((file) => !file.mediaType?.startsWith("image/"));
    throw new Error(
      `Unsupported agent attachment: ${unsupported?.filename ?? "file"}. Only image attachments are supported.`,
    );
  }
  const localAttachments = toImageAttachments(files);
  const text = message.text?.trim();
  const prompt = text || (localAttachments.length ? "Analyze the attached image and help with the GeoGebra task." : "");
  if (!prompt) return null;
  return {
    files,
    localAttachments,
    prompt,
    text,
    snapshot: captureNativeRunRequestSnapshot(input, desktopConfig),
  };
}

export function nativeChatNetworkRetryDelay(attempt: number) {
  return NATIVE_CHAT_NETWORK_RETRY_DELAYS_MS[attempt] ?? null;
}

export function isRetryableNativeChatError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/\b(?:408|425|429|500|502|503|504)\b/.test(message)) return true;
  return /(?:failed to fetch|fetch failed|network|connection|disconnected|load failed|timed? ?out|socket|econnreset|enotfound|temporary failure)/i.test(
    message,
  );
}

export function completeInterruptedToolParts<Message extends UIMessage>(messages: Message[]) {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      if (!isToolUIPart(part) || isCompletedToolPart(part)) return part;
      changed = true;
      return {
        ...part,
        state: "output-error" as const,
        errorText: "Tool execution was interrupted before a result was received.",
      };
    });
    return changed ? ({ ...message, parts } as Message) : message;
  });
}

export function messagesWithSkillPolicy<Message extends UIMessage>(
  messages: Message[],
  config: DesktopConfig,
  locale: "zh-CN" | "en-US",
) {
  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }
  if (latestUserIndex < 0) return messages;
  const latestUser = messages[latestUserIndex]!;
  let latestTextIndex = -1;
  for (let index = latestUser.parts.length - 1; index >= 0; index -= 1) {
    if (latestUser.parts[index]?.type === "text") {
      latestTextIndex = index;
      break;
    }
  }
  if (latestTextIndex < 0) return messages;
  const originalPart = latestUser.parts[latestTextIndex]!;
  if (originalPart.type !== "text") return messages;

  const parts = [...latestUser.parts];
  parts[latestTextIndex] = {
    ...originalPart,
    text: promptWithSkillPolicy(originalPart.text, config, locale),
  };
  const requestMessages = [...messages];
  requestMessages[latestUserIndex] = { ...latestUser, parts } as Message;
  return requestMessages;
}

export function nativeChatTransportMessages<Message extends UIMessage>(
  messages: Message[],
  config: DesktopConfig,
  locale: "zh-CN" | "en-US",
) {
  const visibleMessages = completeInterruptedToolParts(messages);
  return {
    messages: visibleMessages,
    providerMessages: messagesWithSkillPolicy(visibleMessages, config, locale),
  };
}

export function nativeChatRequestBody<Message extends UIMessage>(
  messages: Message[],
  active: { runId: string; conversationId: string },
  snapshot: NativeRunRequestSnapshot,
) {
  return {
    ...nativeChatTransportMessages(messages, snapshot.desktopConfig, snapshot.locale),
    runId: active.runId,
    conversationId: active.conversationId,
    model: snapshot.model,
    locale: snapshot.locale,
    thinking: snapshot.thinking,
    thinkingEffort: snapshot.thinkingEffort,
  };
}

export async function nativeRunHeaders(
  input: Pick<NativeRunRequestInput, "getAuthToken">,
  installationIdRef: { current: string | null },
  correlationId?: string,
) {
  const token = input.getAuthToken();
  const headers: Record<string, string> = {
    "x-client-channel": token ? "desktop-workbench" : "web-workbench",
    [CORRELATION_ID_HEADER]: correlationId ?? createCorrelationId("renderer"),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  else headers["x-guest-session-id"] = guestSessionId(await getInstallationId(installationIdRef));
  return headers;
}

export function toImageAttachments(files: FileUIPart[]): AgentRunImageAttachment[] {
  return files.flatMap((file) => {
    if (!file.mediaType?.startsWith("image/") || typeof file.url !== "string") return [];
    return [{ name: file.filename ?? "image", mediaType: file.mediaType, dataUrl: file.url }];
  });
}

export async function uploadImageAttachments(
  apiOrigin: string,
  token: string | null,
  attachments: AgentRunImageAttachment[],
  correlationId: string,
  request: typeof fetch = fetch,
  trace: (message: string) => void = desktopLogger.trace,
) {
  if (!token || attachments.length === 0) return attachments;
  trace(`Uploading ${attachments.length} agent attachment(s)`);
  return Promise.all(
    attachments.map(async (attachment) => {
      let stage = "source_fetch";
      try {
        const image = await request(attachment.dataUrl);
        if (!image.ok) {
          logAttachmentUploadFallback(correlationId, "source_rejected", attachments.length);
          return attachment;
        }
        const form = new FormData();
        form.append("file", await image.blob(), attachment.name);
        stage = "upload_request";
        const response = await request(new URL("/api/media/images", apiOrigin), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "x-client-channel": "desktop-workbench",
            [CORRELATION_ID_HEADER]: correlationId,
          },
          body: form,
        });
        if (!response.ok) {
          logAttachmentUploadFallback(correlationId, "upload_rejected", attachments.length);
          return attachment;
        }
        stage = "response_parse";
        const payload = (await response.json()) as { url?: unknown };
        if (typeof payload.url === "string") return { ...attachment, dataUrl: payload.url };
        logAttachmentUploadFallback(correlationId, "invalid_response", attachments.length);
        return attachment;
      } catch (error) {
        logAttachmentUploadFallback(
          correlationId,
          `${stage}_${error instanceof TypeError ? "network_error" : "unexpected_error"}`,
          attachments.length,
        );
        return attachment;
      }
    }),
  );
}

function logAttachmentUploadFallback(correlationId: string, failureKind: string, attachmentCount: number) {
  logger.warn("attachment_upload_failed", "AGENT_ATTACHMENT_UPLOAD_FAILED", {
    correlationId,
    failureKind,
    attachmentCount,
  });
}

function guestSessionId(installationId: string) {
  return `frontend_guest_${installationId}`;
}

function isCompletedToolPart(part: { state: string }) {
  return part.state === "output-available" || part.state === "output-error" || part.state === "output-denied";
}
