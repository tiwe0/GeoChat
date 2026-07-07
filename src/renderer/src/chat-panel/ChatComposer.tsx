import { ImagePlus, Send, Square, X } from "lucide-solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { interpolate, type RendererI18n } from "../i18n";
import { IconButton } from "../workbench-ui";
import type { ImageAttachment } from "../workbench-types";

const MAX_TEXT_FILE_BYTES = 256 * 1024;
const textFileExtensionPattern = /\.(?:txt|md|markdown|csv|tsv|json|jsonl|geo|ggbscript|tex)$/iu;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function hasTransferFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function clipboardFiles(data: DataTransfer | null) {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (files.length) return files;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function isTextImportFile(file: File) {
  return file.size <= MAX_TEXT_FILE_BYTES && (file.type.startsWith("text/") || textFileExtensionPattern.test(file.name));
}

function appendDraftBlock(draft: string, block: string) {
  const prefix = draft.trimEnd();
  return prefix ? `${prefix}\n\n${block}` : block;
}

export function ChatComposer(props: {
  draft: string;
  isRunning: boolean;
  imageUploadEnabled: boolean;
  imageUploadDisabledReason: string;
  attachments: ImageAttachment[];
  copy: RendererI18n;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAddImages: (files: FileList | File[]) => void;
  onRemoveImage: (id: string) => void;
  onUploadBlocked: () => void;
}) {
  let imageInput: HTMLInputElement | undefined;
  const [dropActive, setDropActive] = createSignal(false);
  const canSend = createMemo(() => Boolean(props.draft.trim() || props.attachments.length) && !props.isRunning);
  function requestImageUpload() {
    if (props.isRunning) return;
    if (!props.imageUploadEnabled) {
      props.onUploadBlocked();
      return;
    }
    imageInput?.click();
  }

  async function handleFiles(files: FileList | File[]) {
    if (props.isRunning) return;
    const incoming = Array.from(files);
    if (!incoming.length) return;
    const imageFiles = incoming.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length) {
      if (props.imageUploadEnabled) props.onAddImages(imageFiles);
      else props.onUploadBlocked();
    }
    const textFiles = incoming.filter((file) => !file.type.startsWith("image/") && isTextImportFile(file));
    if (!textFiles.length) return;
    const blocks = await Promise.all(textFiles.map(async (file) => {
      const text = await file.text();
      return [
        `【${interpolate(props.copy.composer.pastedTextFile, { name: file.name || "file" })}】`,
        "```text",
        text.trim(),
        "```"
      ].join("\n");
    }));
    props.onDraft(appendDraftBlock(props.draft, blocks.join("\n\n")));
  }

  return (
    <form
      class="composer"
      onDragEnter={(event) => {
        if (!hasTransferFiles(event)) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (!hasTransferFiles(event)) return;
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        const current = event.currentTarget;
        const next = event.relatedTarget as Node | null;
        if (!next || !current.contains(next)) setDropActive(false);
      }}
      onDrop={(event) => {
        if (!hasTransferFiles(event)) return;
        event.preventDefault();
        setDropActive(false);
        void handleFiles(event.dataTransfer?.files ?? []);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (props.isRunning) return;
        props.onSend();
      }}
    >
      <div classList={{ "composer-box": true, "drop-active": dropActive() }}>
        <Show when={dropActive()}>
          <div class="composer-drop-overlay">{props.copy.composer.dropFiles}</div>
        </Show>
        <textarea
          value={props.draft}
          onInput={(event) => props.onDraft(event.currentTarget.value)}
          onPaste={(event) => {
            const files = clipboardFiles(event.clipboardData);
            if (!files.length) return;
            event.preventDefault();
            void handleFiles(files);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
            event.preventDefault();
            if (props.isRunning) return;
            props.onSend();
          }}
          placeholder={props.copy.composer.placeholder}
          aria-label={props.copy.composer.ariaLabel}
          rows={2}
        />
        <Show when={props.attachments.length}>
          <div class="composer-attachments">
            <For each={props.attachments}>
              {(attachment) => (
                <figure class="composer-attachment">
                  <img src={attachment.dataUrl} alt={attachment.name} />
                  <figcaption>
                    <span>{attachment.name}</span>
                    <small>{formatFileSize(attachment.size)}</small>
                  </figcaption>
                  <button type="button" title={props.copy.composer.removeImage} data-tooltip={props.copy.composer.removeImage} onClick={() => props.onRemoveImage(attachment.id)}>
                    <X size={12} />
                  </button>
                </figure>
              )}
            </For>
          </div>
        </Show>
        <div class="composer-footer">
          <span>{props.imageUploadEnabled ? props.copy.composer.hintWithImages : props.copy.composer.hintTextOnly}</span>
          <div class="composer-actions">
            <input
              ref={(element) => {
                imageInput = element;
              }}
              class="image-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                const files = event.currentTarget.files;
                if (files) void handleFiles(files);
                event.currentTarget.value = "";
              }}
            />
            <IconButton
              title={props.imageUploadEnabled ? props.copy.composer.uploadImage : props.imageUploadDisabledReason || props.copy.composer.uploadDisabled}
              disabled={props.isRunning || !props.imageUploadEnabled}
              onClick={requestImageUpload}
            >
              <ImagePlus size={16} />
            </IconButton>
            <Show
              when={props.isRunning}
              fallback={
                <button class="send-button" type="submit" disabled={!canSend()} title={props.copy.composer.send} data-tooltip={props.copy.composer.send}>
                  <Send size={18} />
                </button>
              }
            >
              <button class="send-button stop" type="button" title={props.copy.composer.stop} data-tooltip={props.copy.composer.stop} onClick={props.onStop}>
                <Square size={14} fill="currentColor" />
              </button>
            </Show>
          </div>
        </div>
      </div>
    </form>
  );
}
