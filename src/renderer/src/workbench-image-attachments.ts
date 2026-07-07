import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import type { AgentModelRegistrySchema } from "@geochat-ai/app";
import { interpolate, type RendererI18n } from "./i18n";
import type { DesktopChatMessage, DesktopConfig, ImageAttachment } from "./workbench-types";
import { configHasImageCapableModel, configSupportsImageAttachments } from "./desktop-config";
import { formatFileSize, readImageFile } from "./workbench-messages";

const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export function createImageAttachmentState(input: {
  config: Accessor<DesktopConfig>;
  modelRegistrySchema?: Accessor<AgentModelRegistrySchema | undefined>;
  copy: Accessor<RendererI18n>;
  createAssistantMessage: (content: string) => DesktopChatMessage;
  appendMessage: (message: DesktopChatMessage) => void;
}) {
  const [attachments, setAttachments] = createSignal<ImageAttachment[]>([]);
  const [notice, setNotice] = createSignal("");
  const enabled = createMemo(() => configSupportsImageAttachments(input.config(), input.modelRegistrySchema?.()));
  const disabledReason = createMemo(() => {
    if (enabled()) return "";
    return configHasImageCapableModel(input.config(), input.modelRegistrySchema?.()) ? input.copy().chat.uploadNeedsVisionKey : input.copy().chat.uploadBlocked;
  });

  createEffect(() => {
    if (!enabled() && attachments().length) clear();
  });

  async function add(files: FileList | File[]) {
    if (!enabled()) return;
    const remainingSlots = MAX_IMAGE_ATTACHMENTS - attachments().length;
    if (remainingSlots <= 0) return;
    const imageFiles = Array.from(files)
      .filter((file) => file.type.startsWith("image/") && file.size <= MAX_IMAGE_ATTACHMENT_BYTES)
      .slice(0, remainingSlots);
    if (!imageFiles.length) {
      input.appendMessage(input.createAssistantMessage(
        interpolate(input.copy().chat.noImageAdded, { size: formatFileSize(MAX_IMAGE_ATTACHMENT_BYTES) })
      ));
      return;
    }
    const loaded = await Promise.all(imageFiles.map(readImageFile));
    setAttachments((current) => [...current, ...loaded].slice(0, MAX_IMAGE_ATTACHMENTS));
  }

  function remove(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function clear() {
    setAttachments([]);
  }

  function notifyBlocked() {
    setNotice(disabledReason());
    globalThis.setTimeout(() => setNotice(""), 1800);
  }

  return {
    add,
    attachments,
    clear,
    disabledReason,
    enabled,
    notice,
    notifyBlocked,
    remove
  };
}
