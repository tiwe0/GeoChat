import AttachFileRounded from "@mui/icons-material/AttachFileRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DescriptionRounded from "@mui/icons-material/DescriptionRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import StopRounded from "@mui/icons-material/StopRounded";
import UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import { Box, Chip, CircularProgress, IconButton, Stack, TextField, Typography } from "@mui/material";
import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type { FileUIPart } from "ai";
import { useTranslation } from "react-i18next";
import {
  AGENT_ATTACHMENT_ACCEPT,
  MAX_AGENT_FILE_COUNT,
  MAX_AGENT_FILE_SIZE,
  MAX_AGENT_TOTAL_FILE_SIZE,
  isSupportedAgentFile,
} from "../features/attachments/capabilities";
import { imageFilesFromClipboard, insertTextAtSelection } from "../features/chat/composerPaste";
import { ModelMenu, type ThinkingEffort } from "./ModelMenu";
import type { RuntimeModelOption } from "../features/models/modelCatalog";


export type ComposerAttachment = {
  id: string;
  signature: string;
  size: number;
  part: FileUIPart;
};

type ChatComposerProps = {
  value: string;
  attachments: ComposerAttachment[];
  busy: boolean;
  model: string;
  models: readonly RuntimeModelOption[];
  thinkingEnabled: boolean;
  thinkingEffort: ThinkingEffort;
  sendDisabled: boolean;
  error?: string | null;
  onChange: (value: string) => void;
  onAttachmentsChange: (attachments: ComposerAttachment[]) => void;
  onSend: () => void;
  onStop: () => void;
  onModelChange: (model: string) => void;
  modelPortalContainer: () => Element | null;
  onThinkingEnabledChange: (enabled: boolean) => void;
  onThinkingEffortChange: (effort: ThinkingEffort) => void;
};

function fileSignature(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file: File, failureMessage: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error(failureMessage));
    reader.onerror = () => reject(new Error(failureMessage, { cause: reader.error }));
    reader.readAsDataURL(file);
  });
}

export function ChatComposer({
  value,
  attachments,
  busy,
  model,
  models,
  thinkingEnabled,
  thinkingEffort,
  sendDisabled,
  error: submissionError,
  onChange,
  onAttachmentsChange,
  onSend,
  onStop,
  onModelChange,
  modelPortalContainer,
  onThinkingEnabledChange,
  onThinkingEffortChange,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  async function addFiles(files: Iterable<File>) {
    const fileList = Array.from(files);
    if (busy || isPreparingFiles || fileList.length === 0) return;

    const existingSignatures = new Set(attachments.map((attachment) => attachment.signature));
    const acceptedFiles: File[] = [];
    let totalSize = attachments.reduce((sum, attachment) => sum + attachment.size, 0);
    let validationError: string | null = null;

    for (const file of fileList) {
      const signature = fileSignature(file);
      if (existingSignatures.has(signature)) continue;
      if (!isSupportedAgentFile(file)) {
        validationError ??= t("composer.unsupportedFile", { name: file.name });
        continue;
      }
      if (file.size > MAX_AGENT_FILE_SIZE) {
        validationError ??= t("composer.fileTooLarge", { name: file.name });
        continue;
      }
      if (attachments.length + acceptedFiles.length >= MAX_AGENT_FILE_COUNT) {
        validationError ??= t("composer.tooManyFiles", { count: MAX_AGENT_FILE_COUNT });
        break;
      }
      if (totalSize + file.size > MAX_AGENT_TOTAL_FILE_SIZE) {
        validationError ??= t("composer.totalTooLarge");
        continue;
      }
      existingSignatures.add(signature);
      acceptedFiles.push(file);
      totalSize += file.size;
    }

    setAttachmentError(validationError);
    if (acceptedFiles.length === 0) return;

    setIsPreparingFiles(true);
    try {
      const prepared = await Promise.all(acceptedFiles.map(async (file): Promise<ComposerAttachment> => ({
        id: crypto.randomUUID(),
        signature: fileSignature(file),
        size: file.size,
        part: {
          type: "file",
          filename: file.name,
          mediaType: file.type || "text/plain",
          url: await fileToDataUrl(file, t("composer.fileReadFailed")),
        },
      })));
      onAttachmentsChange([...attachments, ...prepared]);
    } catch (error) {
      console.error("[ERROR] Caught exception at src/renderer-react/src/components/ChatComposer.tsx:154", error);
      setAttachmentError(error instanceof Error ? error.message : t("composer.fileAttachFailed"));
    } finally {
      setIsPreparingFiles(false);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLFormElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLFormElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    void addFiles(event.dataTransfer.files);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const imageFiles = imageFilesFromClipboard(event.clipboardData);
    if (imageFiles.length === 0) return;

    event.preventDefault();
    const pastedText = event.clipboardData.getData("text/plain");
    const target = event.target;
    if (pastedText && (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) {
      const insertion = insertTextAtSelection(value, pastedText, target.selectionStart, target.selectionEnd);
      onChange(insertion.value);
      window.requestAnimationFrame(() => target.setSelectionRange(insertion.cursor, insertion.cursor));
    }
    void addFiles(imageFiles);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.closest("form")?.requestSubmit();
  }

  return (
    <Box
      component="form"
      className="geochatpro-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!sendDisabled && !isPreparingFiles) onSend();
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        position: "relative",
        p: 1.25,
        borderTop: 1,
        borderColor: isDraggingFiles ? "primary.main" : "divider",
        bgcolor: isDraggingFiles ? "primary.light" : "background.paper",
        transition: (theme) => theme.transitions.create(["background-color", "border-color"], { duration: 150 }),
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={AGENT_ATTACHMENT_ACCEPT}
        hidden
        onChange={handleFileInput}
      />

      {attachments.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mb: 1 }}>
          {attachments.map((attachment) => {
            const filename = attachment.part.filename ?? t("common.attachment");
            const removeAttachment = () => onAttachmentsChange(attachments.filter((item) => item.id !== attachment.id));

            return attachment.part.mediaType.startsWith("image/") ? (
              <Box
                key={attachment.id}
                title={`${filename} (${formatFileSize(attachment.size)})`}
                sx={{
                  position: "relative",
                  width: 72,
                  height: 72,
                  flex: "0 0 auto",
                  overflow: "hidden",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  bgcolor: "background.default",
                }}
              >
                <Box
                  component="img"
                  src={attachment.part.url}
                  alt={filename}
                  sx={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
                />
                <IconButton
                  type="button"
                  size="small"
                  disabled={busy}
                  onClick={removeAttachment}
                  aria-label={t("composer.removeAttachment", { name: filename })}
                  title={t("composer.removeAttachment", { name: filename })}
                  sx={{
                    position: "absolute",
                    top: 3,
                    right: 3,
                    width: 22,
                    height: 22,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: "50%",
                    bgcolor: "background.paper",
                    color: "text.primary",
                    "&:hover": { bgcolor: "grey.100" },
                  }}
                >
                  <CloseRounded sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
            ) : (
              <Chip
                key={attachment.id}
                size="small"
                variant="outlined"
                icon={<DescriptionRounded />}
                label={filename}
                title={`${filename} (${formatFileSize(attachment.size)})`}
                disabled={busy}
                onDelete={removeAttachment}
                sx={{ maxWidth: "100%", "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
              />
            );
          })}
        </Stack>
      )}

      {(attachmentError ?? submissionError) && (
        <Typography role="alert" variant="caption" color="error" sx={{ display: "block", mb: 0.75 }}>
          {attachmentError ?? submissionError}
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <IconButton
          type="button"
          size="small"
          disabled={busy || isPreparingFiles}
          onClick={() => fileInputRef.current?.click()}
          aria-label={t("composer.attachFiles")}
          title={t("composer.attachFiles")}
          data-copilot-tour="attachments"
          sx={{
            width: 34,
            height: 34,
            color: "text.secondary",
            "&:hover": { bgcolor: "primary.light", color: "primary.dark" },
          }}
        >
          {isPreparingFiles ? <CircularProgress size={18} /> : <AttachFileRounded fontSize="small" />}
        </IconButton>
        <TextField
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t("composer.placeholder")}
          // A placeholder is not an accessible name: assistive tech treats it
          // inconsistently and it vanishes on the first keystroke. This is the
          // app's primary input, so it gets a real one.
          aria-label={t("composer.placeholder")}
          disabled={busy}
          multiline
          minRows={1}
          maxRows={8}
          size="small"
          fullWidth
          sx={{
            "& .MuiOutlinedInput-root": {
              bgcolor: "background.paper",
              py: 0.35,
            },
          }}
        />
        <ModelMenu
          value={model}
          models={models}
          disabled={busy}
          thinkingEnabled={thinkingEnabled}
          thinkingEffort={thinkingEffort}
          portalContainer={modelPortalContainer}
          onChange={onModelChange}
          onThinkingEnabledChange={onThinkingEnabledChange}
          onThinkingEffortChange={onThinkingEffortChange}
          tourId="model"
        />
        <IconButton
          type={busy ? "button" : "submit"}
          color="primary"
          disabled={busy ? false : sendDisabled || isPreparingFiles}
          onClick={busy ? onStop : undefined}
          aria-label={busy ? t("composer.stopGeneration") : t("composer.sendMessage")}
          title={busy ? t("composer.stopGeneration") : t("composer.sendMessage")}
          data-copilot-tour="send"
          sx={{
            width: 38,
            height: 38,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            transition: "background-color 160ms ease, transform 160ms ease",
            "&:hover": { bgcolor: "primary.dark", transform: "translateY(-1px)" },
            "&:active": { transform: "translateY(0)" },
            "&.Mui-disabled": { bgcolor: "action.disabledBackground" },
          }}
        >
          {busy ? <StopRounded fontSize="small" /> : <PlayArrowRounded fontSize="small" />}
        </IconButton>
      </Stack>

      {isDraggingFiles && (
        <Stack
          aria-hidden="true"
          direction="row"
          spacing={1}
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "primary.light",
            color: "primary.dark",
            pointerEvents: "none",
          }}
        >
          <UploadFileRounded />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("composer.dropFiles")}</Typography>
        </Stack>
      )}
    </Box>
  );
}
