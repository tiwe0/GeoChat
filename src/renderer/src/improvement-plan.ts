import type { RuntimeInfo } from "@geochat-ai/app";
import type { DesktopChatMessage, DesktopConfig } from "./workbench-types";
import type { Locale } from "./i18n";
import {
  resolveWorkbenchDesktopRuntime,
  type WorkbenchDesktopRuntime
} from "./workbench-desktop-runtime";

const QUEUE_KEY = "geochat.improvement.queue.v1";
const MAX_QUEUE_ITEMS = 100;
const MAX_CONTENT_LENGTH = 5_000;
const UPLOAD_BATCH_SIZE = 20;
const INITIAL_FLUSH_DELAY_MS = 60_000;
const ONLINE_FLUSH_DELAY_MS = 30_000;
const FLUSH_INTERVAL_MS = 5 * 60_000;

type ImprovementPlanSample = {
  sampleId: string;
  source: "desktop";
  appVersion: string | null;
  locale: Locale;
  modelProvider: string;
  modelId: string;
  visionModelProvider: string;
  visionModelId: string;
  conversationHash: string;
  messageHash: string;
  role: DesktopChatMessage["role"];
  contentRedacted: string;
  attachments: {
    count: number;
    mediaTypes: string[];
    sizes: number[];
  };
  toolCalls: Array<{
    name: string;
    status: string | null;
    hasError: boolean;
  }>;
  usage: DesktopChatMessage["usage"] | null;
  clientCreatedAt: string;
};

export type ImprovementPlanUploaderRuntime = WorkbenchDesktopRuntime & {
  queueStorage: Pick<Storage, "getItem" | "setItem"> | undefined;
  isOnline: () => boolean;
  addOnlineListener: (handler: () => void) => void;
  removeOnlineListener: (handler: () => void) => void;
};

export function createImprovementPlanUploader(input: {
  runtime: () => RuntimeInfo | undefined;
  enabled: () => boolean;
  desktopRuntime?: Partial<ImprovementPlanUploaderRuntime>;
}) {
  const uploaderRuntime = resolveImprovementPlanUploaderRuntime(input.desktopRuntime);
  let flushing = false;
  let flushTimeout: number | undefined;

  const interval = uploaderRuntime.setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);

  function scheduleFlush(delayMs: number) {
    if (flushTimeout !== undefined) uploaderRuntime.clearTimeout(flushTimeout);
    flushTimeout = uploaderRuntime.setTimeout(() => {
      flushTimeout = undefined;
      void flush();
    }, delayMs);
  }

  async function enqueueMessage(inputMessage: {
    conversationId: string;
    message: DesktopChatMessage;
    config: DesktopConfig;
    locale: Locale;
    appVersion: string | null;
  }) {
    if (!input.enabled()) return;
    const sample = await createSample(inputMessage);
    const queue = readQueue(uploaderRuntime.queueStorage);
    queue.push(sample);
    writeQueue(uploaderRuntime.queueStorage, queue.slice(-MAX_QUEUE_ITEMS));
  }

  async function flush() {
    if (flushing || !input.enabled() || !uploaderRuntime.isOnline()) return;
    const desktopApi = uploaderRuntime.desktopApi();
    if (!desktopApi?.uploadImprovementPlanSamples) return;
    const queue = readQueue(uploaderRuntime.queueStorage);
    if (!queue.length) return;
    flushing = true;
    try {
      const batch = queue.slice(0, UPLOAD_BATCH_SIZE);
      const result = await desktopApi.uploadImprovementPlanSamples(batch);
      if (result.ok) writeQueue(uploaderRuntime.queueStorage, queue.slice(batch.length));
    } catch {
      // Best-effort telemetry: keep the queue for a later background retry.
    } finally {
      flushing = false;
    }
  }

  function dispose() {
    uploaderRuntime.clearInterval(interval);
    if (flushTimeout !== undefined) uploaderRuntime.clearTimeout(flushTimeout);
    uploaderRuntime.removeOnlineListener(onOnline);
  }

  function onOnline() {
    scheduleFlush(ONLINE_FLUSH_DELAY_MS);
  }

  uploaderRuntime.addOnlineListener(onOnline);
  scheduleFlush(INITIAL_FLUSH_DELAY_MS);

  return { enqueueMessage, flush, dispose };
}

function resolveImprovementPlanUploaderRuntime(
  runtime?: Partial<ImprovementPlanUploaderRuntime>
): ImprovementPlanUploaderRuntime {
  const desktopRuntime = resolveWorkbenchDesktopRuntime(runtime);
  const browserWindow = typeof window === "undefined" ? undefined : window;
  return {
    ...desktopRuntime,
    queueStorage: runtime?.queueStorage ?? browserWindow?.localStorage,
    isOnline: runtime?.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false),
    addOnlineListener:
      runtime?.addOnlineListener ??
      ((handler) => {
        browserWindow?.addEventListener("online", handler);
      }),
    removeOnlineListener:
      runtime?.removeOnlineListener ??
      ((handler) => {
        browserWindow?.removeEventListener("online", handler);
      })
  };
}

async function createSample(input: {
  conversationId: string;
  message: DesktopChatMessage;
  config: DesktopConfig;
  locale: Locale;
  appVersion: string | null;
}): Promise<ImprovementPlanSample> {
  const { conversationId, message, config } = input;
  return {
    sampleId: randomSampleId(),
    source: "desktop",
    appVersion: input.appVersion,
    locale: input.locale,
    modelProvider: config.model.provider,
    modelId: config.model.model,
    visionModelProvider: config.visionModel.provider,
    visionModelId: config.visionModel.model,
    conversationHash: await hashStableId(`conversation:${conversationId}`),
    messageHash: await hashStableId(`message:${message.id}`),
    role: message.role,
    contentRedacted: redactText(message.content),
    attachments: summarizeAttachments(message),
    toolCalls: summarizeToolCalls(message),
    usage: message.usage ?? null,
    clientCreatedAt: message.createdAt
  };
}

function readQueue(storage: Pick<Storage, "getItem"> | undefined): ImprovementPlanSample[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isSample) : [];
  } catch {
    return [];
  }
}

function writeQueue(storage: Pick<Storage, "setItem"> | undefined, queue: ImprovementPlanSample[]) {
  if (!storage) return;
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // If local storage is full or unavailable, drop the oldest telemetry instead of affecting chat.
    try {
      storage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-Math.floor(MAX_QUEUE_ITEMS / 2))));
    } catch {
      // Ignore storage failures; participation is best effort.
    }
  }
}

function isSample(value: unknown): value is ImprovementPlanSample {
  return Boolean(value) && typeof value === "object" && typeof (value as { sampleId?: unknown }).sampleId === "string";
}

function summarizeAttachments(message: DesktopChatMessage): ImprovementPlanSample["attachments"] {
  const attachments = message.attachments ?? [];
  return {
    count: attachments.length,
    mediaTypes: [...new Set(attachments.map((attachment) => attachment.mediaType).filter(Boolean))].slice(0, 8),
    sizes: attachments.map((attachment) => attachment.size).filter((size) => Number.isFinite(size)).slice(0, 16)
  };
}

function summarizeToolCalls(message: DesktopChatMessage): ImprovementPlanSample["toolCalls"] {
  return (message.toolCalls ?? []).slice(0, 24).map((call) => {
    const record = call as Record<string, unknown>;
    const functionRecord = isRecord(record.function) ? record.function : undefined;
    const name = stringValue(record.name) ?? stringValue(record.toolName) ?? stringValue(functionRecord?.name) ?? "unknown";
    const status = stringValue(record.status);
    return {
      name,
      status,
      hasError: Boolean(record.error) || status === "error" || status === "failed"
    };
  });
}

function redactText(input: string): string {
  return input
    .replace(/data:[^,\s]+,[^\s)]+/gi, "[data-url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .replace(/\b(?:sk|cfat)_[A-Za-z0-9_+-]{8,}\b/g, "[secret]")
    .replace(/\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[secret]")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[token]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[token]")
    .replace(/\b\d{11,}\b/g, "[number]")
    .slice(0, MAX_CONTENT_LENGTH);
}

async function hashStableId(value: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16)}`;
  }
}

function randomSampleId() {
  return `imp_${crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
