import AttachFileRounded from "@mui/icons-material/AttachFileRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import DragIndicatorRounded from "@mui/icons-material/DragIndicatorRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import StopRounded from "@mui/icons-material/StopRounded";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { motion, useReducedMotion } from "motion/react";
import {
  useRef,
  useState,
  useEffect,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ReactNode } from "react";
import {
  AGENT_ATTACHMENT_ACCEPT,
  MAX_AGENT_FILE_COUNT,
  MAX_AGENT_FILE_SIZE,
  MAX_AGENT_TOTAL_FILE_SIZE,
  isSupportedAgentFile,
} from "../attachments/capabilities";
import { imageFilesFromClipboard, insertTextAtSelection } from "../chat/composerPaste";
import type { FusionAttachment } from "./types";

const MotionPaper = motion.create(Paper);

function fileSignature(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function fileToDataUrl(file: File, failureMessage: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error(failureMessage));
    reader.onerror = () => reject(new Error(failureMessage, { cause: reader.error }));
    reader.readAsDataURL(file);
  });
}

export function FusionComposer(props: {
  x: number;
  y: number;
  value: string;
  attachments: FusionAttachment[];
  busy: boolean;
  disabled: boolean;
  modelLabel: string;
  focusSignal: number;
  modelControl?: ReactNode;
  selectionLabel?: string;
  placeholder: string;
  attachLabel: string;
  removeAttachmentLabel: string;
  sendLabel: string;
  stopLabel: string;
  dragLabel: string;
  fileReadFailed: string;
  unsupportedFile: (name: string) => string;
  fileTooLarge: (name: string) => string;
  tooManyFiles: (count: number) => string;
  totalTooLarge: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onAttachmentsChange: (attachments: FusionAttachment[]) => void;
  onSend: () => void;
  onStop: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragStop: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textInputRef.current?.focus({ preventScroll: true });
  }, [props.focusSignal]);
  const canSubmit = !props.disabled && (Boolean(props.value.trim()) || props.attachments.length > 0);

  async function addFiles(files: Iterable<File>) {
    if (props.busy || preparing) return;
    const signatures = new Set(props.attachments.map((attachment) => attachment.signature));
    const accepted: File[] = [];
    let totalSize = props.attachments.reduce((sum, attachment) => sum + attachment.size, 0);
    let error: string | null = null;
    for (const file of files) {
      const signature = fileSignature(file);
      if (signatures.has(signature)) continue;
      if (!isSupportedAgentFile(file)) { error ??= props.unsupportedFile(file.name); continue; }
      if (file.size > MAX_AGENT_FILE_SIZE) { error ??= props.fileTooLarge(file.name); continue; }
      if (props.attachments.length + accepted.length >= MAX_AGENT_FILE_COUNT) {
        error ??= props.tooManyFiles(MAX_AGENT_FILE_COUNT);
        break;
      }
      if (totalSize + file.size > MAX_AGENT_TOTAL_FILE_SIZE) { error ??= props.totalTooLarge; continue; }
      signatures.add(signature);
      totalSize += file.size;
      accepted.push(file);
    }
    setAttachmentError(error);
    if (accepted.length === 0) return;
    setPreparing(true);
    try {
      const next = await Promise.all(accepted.map(async (file): Promise<FusionAttachment> => ({
        id: crypto.randomUUID(),
        signature: fileSignature(file),
        size: file.size,
        part: {
          type: "file",
          filename: file.name,
          mediaType: file.type,
          url: await fileToDataUrl(file, props.fileReadFailed),
        },
      })));
      props.onAttachmentsChange([...props.attachments, ...next]);
    } catch (caughtError) {
      console.error("[ERROR] Fusion attachment preparation failed", caughtError);
      setAttachmentError(caughtError instanceof Error ? caughtError.message : props.fileReadFailed);
    } finally {
      setPreparing(false);
    }
  }

  function handleInputFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void addFiles(event.target.files);
    event.target.value = "";
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = imageFilesFromClipboard(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    const pastedText = event.clipboardData.getData("text/plain");
    const target = event.target;
    if (pastedText && (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) {
      const insertion = insertTextAtSelection(props.value, pastedText, target.selectionStart, target.selectionEnd);
      props.onChange(insertion.value);
      globalThis.requestAnimationFrame(() => target.setSelectionRange(insertion.cursor, insertion.cursor));
    }
    void addFiles(files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.closest("form")?.requestSubmit();
  }

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (props.busy || preparing || !canSubmit) return;
        props.onSend();
      }}
      sx={{
        position: "fixed",
        left: props.x,
        top: props.y,
        width: "min(390px, calc(100vw - 24px))",
        transform: "translateX(-50%)",
        pointerEvents: "auto",
      }}
    >
    <MotionPaper
      initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      elevation={8}
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 3,
        overflow: "hidden",
        bgcolor: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(22px)",
      }}
    >
      <Stack
        data-copilot-tour="fusion-composer"
        direction="row"
        spacing={0.75}
        onPointerDown={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest("button, input, textarea, select, [role='button'], [role='menuitem']")) return;
          props.onDragStart(event);
        }}
        onPointerMove={props.onDragMove}
        onPointerUp={props.onDragStop}
        onPointerCancel={props.onDragStop}
        onLostPointerCapture={props.onDragStop}
        sx={{ alignItems: "center", px: 1, pt: 0.625, cursor: "grab", touchAction: "none", userSelect: "none" }}
        aria-label={props.dragLabel}
      >
        <DragIndicatorRounded sx={{ fontSize: 16, color: "text.disabled" }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>{props.modelControl ?? <Typography variant="caption" color="text.secondary" noWrap>{props.modelLabel}</Typography>}</Box>
        {props.selectionLabel && (
          <Typography variant="caption" color="primary.main" noWrap sx={{ maxWidth: 180, fontWeight: 650 }} title={props.selectionLabel}>
            {props.selectionLabel}
          </Typography>
        )}
      </Stack>
      {props.attachments.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ px: 1, pt: 0.5, overflowX: "auto" }}>
          {props.attachments.map((attachment) => (
            <Chip
              key={attachment.id}
              size="small"
              label={attachment.part.filename}
              onDelete={() => props.onAttachmentsChange(props.attachments.filter((item) => item.id !== attachment.id))}
              deleteIcon={<CloseRounded />}
              aria-label={`${props.removeAttachmentLabel}: ${attachment.part.filename ?? ""}`}
            />
          ))}
        </Stack>
      )}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-end", p: 0.75, pt: 0.25 }}>
        <input ref={fileInputRef} hidden type="file" multiple accept={AGENT_ATTACHMENT_ACCEPT} onChange={handleInputFiles} />
        <Tooltip title={props.attachLabel} arrow>
          <span>
            <IconButton size="small" disabled={props.busy || preparing} onClick={() => fileInputRef.current?.click()} aria-label={props.attachLabel} data-copilot-tour="fusion-attachments">
              {preparing ? <CircularProgress size={17} /> : <AttachFileRounded fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        <TextField
          inputRef={textInputRef}
          autoFocus
          fullWidth
          multiline
          maxRows={5}
          size="small"
          variant="standard"
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
          onFocus={props.onFocus}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          slotProps={{ input: { disableUnderline: true } }}
          sx={{ py: 0.5, "& textarea": { lineHeight: 1.45 } }}
        />
        <Tooltip title={props.busy ? props.stopLabel : props.sendLabel} arrow>
          <span>
            <IconButton
              type={props.busy ? "button" : "submit"}
              data-copilot-tour="fusion-send"
              size="small"
              color="primary"
              disabled={preparing || (!props.busy && !canSubmit)}
              onClick={props.busy ? props.onStop : undefined}
              aria-label={props.busy ? props.stopLabel : props.sendLabel}
            >
              {props.busy ? <StopRounded fontSize="small" /> : <SendRounded fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      {attachmentError && (
        <Box sx={{ px: 1.25, pb: 0.75 }}>
          <Typography variant="caption" color="error.main">{attachmentError}</Typography>
        </Box>
      )}
    </MotionPaper>
    </Box>
  );
}
