import {
  AttachmentPrimitive,
  ComposerPrimitive,
  unstable_useComposerInputHistory,
  useAui,
  useAuiEvent,
  useAuiState,
  type Attachment,
} from "@assistant-ui/react";
import {
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  type SxProps,
  type Theme,
} from "@mui/material";
import { FileTextIcon, PaperclipIcon, SendIcon, SquareIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FocusEventHandler,
  type ReactNode,
} from "react";
import { insertTextAtSelection } from "../chat/composerPaste";
import { FLOATING_SURFACE_ELEVATION } from "../../theme";

export type GeoChatComposerVariant = "window" | "fusion";

export type GeoChatComposerClassNames = {
  actions?: string;
  attachments?: string;
  error?: string;
  header?: string;
  input?: string;
  root?: string;
};

export type GeoChatComposerSx = {
  actions?: SxProps<Theme>;
  attachments?: SxProps<Theme>;
  header?: SxProps<Theme>;
  input?: SxProps<Theme>;
  root?: SxProps<Theme>;
};

export type GeoChatComposerProps = {
  attachLabel: string;
  classNames?: GeoChatComposerClassNames;
  disabled?: boolean;
  error?: string | null;
  focusSignal?: number;
  header?: ReactNode;
  modelControl?: ReactNode;
  onAttachmentError?: (message: string) => void;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  onSubmit?: () => void;
  placeholder: string;
  removeAttachmentLabel: string | ((name: string) => string);
  selectionLabel?: string;
  sendLabel: string;
  stopLabel: string;
  sx?: GeoChatComposerSx;
  variant?: GeoChatComposerVariant;
  inputProps?: Omit<
    ComponentProps<typeof ComposerPrimitive.Input>,
    "disabled" | "placeholder" | "submitMode" | "submitOnEnter"
  >;
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function useAttachmentPreview(attachment: Attachment) {
  const file = attachment.file;
  return useMemo(() => {
    if (!file || !file.type.startsWith("image/") || typeof URL.createObjectURL !== "function") return null;
    const url = URL.createObjectURL(file);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }, [file]);
}

function GeoChatComposerAttachment(props: {
  attachment: Attachment;
  removeLabel: string | ((name: string) => string);
  variant: GeoChatComposerVariant;
}) {
  const preview = useAttachmentPreview(props.attachment);
  useEffect(() => () => preview?.revoke(), [preview]);
  const removingDisabled = props.attachment.status.type === "running";
  const label = typeof props.removeLabel === "function"
    ? props.removeLabel(props.attachment.name)
    : `${props.removeLabel}: ${props.attachment.name}`;

  if (preview) {
    return (
      <AttachmentPrimitive.Root
        title={`${props.attachment.name}${props.attachment.file ? ` (${formatFileSize(props.attachment.file.size)})` : ""}`}
        style={{
          position: "relative",
          width: props.variant === "fusion" ? 48 : 72,
          height: props.variant === "fusion" ? 48 : 72,
          flex: "0 0 auto",
          overflow: "hidden",
          border: "1px solid rgba(15, 23, 42, 0.14)",
          borderRadius: 10,
          background: "rgba(248, 250, 252, 0.92)",
        }}
      >
        <img src={preview.url} alt={props.attachment.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        <AttachmentPrimitive.Remove
          aria-label={label}
          title={label}
          disabled={removingDisabled}
          style={{
            position: "absolute",
            top: 3,
            right: 3,
            display: "grid",
            width: 22,
            height: 22,
            padding: 0,
            placeItems: "center",
            border: "1px solid rgba(15, 23, 42, 0.14)",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.94)",
          }}
        >
          <XIcon size={14} />
        </AttachmentPrimitive.Remove>
      </AttachmentPrimitive.Root>
    );
  }

  return (
    <AttachmentPrimitive.Root
      style={{
        display: "inline-flex",
        minWidth: 0,
        maxWidth: "100%",
        alignItems: "center",
        gap: 6,
        padding: "4px 7px",
        border: "1px solid rgba(15, 23, 42, 0.14)",
        borderRadius: 999,
      }}
    >
      <FileTextIcon size={15} />
      <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <AttachmentPrimitive.Name />
      </Box>
      <AttachmentPrimitive.Remove aria-label={label} title={label} disabled={removingDisabled}>
        <XIcon size={14} />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

/** Shared assistant-ui composer used by both GeoChat presentation modes. */
export function GeoChatComposer({
  attachLabel,
  classNames = {},
  disabled = false,
  error,
  focusSignal = 0,
  header,
  inputProps,
  modelControl,
  onAttachmentError,
  onFocus,
  onSubmit,
  placeholder,
  removeAttachmentLabel,
  selectionLabel,
  sendLabel,
  stopLabel,
  sx = {},
  variant = "window",
}: GeoChatComposerProps) {
  const aui = useAui();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const history = unstable_useComposerInputHistory();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const canCancel = useAuiState((state) => state.composer.canCancel);
  const attachments = useAuiState((state) => state.composer.attachments);
  const attachmentPending = attachments.some((attachment) => attachment.status.type === "running");

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus({ preventScroll: true });
  }, [focusSignal]);

  useAuiEvent("composer.attachmentAddError", ({ message }) => {
    setAttachmentError(message);
    onAttachmentError?.(message);
  });
  useAuiEvent("composer.attachmentAdd", () => setAttachmentError(null));

  const isFusion = variant === "fusion";
  const shownError = attachmentError ?? error;
  const customKeyDown = inputProps?.onKeyDown;
  const customPaste = inputProps?.onPaste;

  return (
    <ComposerPrimitive.AttachmentDropzone disabled={disabled || isRunning}>
      <ComposerPrimitive.Root
        compact={isFusion}
        className={classNames.root}
        data-geochat-composer="true"
        data-composer-variant={variant}
        onSubmit={() => {
          setAttachmentError(null);
          onSubmit?.();
        }}
        style={{ width: "100%" }}
      >
        <Box
          sx={[
            {
              position: "relative",
              width: "100%",
              boxSizing: "border-box",
              border: 1,
              borderColor: "divider",
              borderRadius: isFusion ? 3 : 1.5,
              bgcolor: isFusion ? "rgba(255,255,255,0.94)" : "background.paper",
              backdropFilter: isFusion ? "blur(22px)" : undefined,
              boxShadow: isFusion ? FLOATING_SURFACE_ELEVATION : 0,
              overflow: "hidden",
              transition: (theme) => theme.transitions.create(["background-color", "border-color"], { duration: 150 }),
              "[data-dragging='true'] &": { borderColor: "primary.main", bgcolor: "primary.light" },
              "@media (prefers-reduced-motion: reduce)": { transition: "none" },
            },
            ...(Array.isArray(sx.root) ? sx.root : [sx.root]),
          ]}
        >
          {(header || modelControl || selectionLabel) && (
            <Stack
              className={classNames.header}
              direction="row"
              spacing={0.75}
              sx={[
                { minWidth: 0, alignItems: "center", px: isFusion ? 1 : 1.25, pt: 0.75, pb: 0.25 },
                ...(Array.isArray(sx.header) ? sx.header : [sx.header]),
              ]}
            >
              {header ? (
                <Box sx={{ minWidth: 0, flex: 1 }}>{header}</Box>
              ) : (
                <>
                  <Box sx={{ minWidth: 0, flex: 1 }}>{modelControl}</Box>
                  {selectionLabel && <Typography variant="caption" color="primary.main" noWrap>{selectionLabel}</Typography>}
                </>
              )}
            </Stack>
          )}

          {attachments.length > 0 && (
            <Stack
              className={classNames.attachments}
              direction="row"
              sx={[
                { flexWrap: "wrap", gap: 0.75, px: isFusion ? 1 : 1.25, pt: 0.75 },
                ...(Array.isArray(sx.attachments) ? sx.attachments : [sx.attachments]),
              ]}
            >
              <ComposerPrimitive.Attachments>
                {({ attachment }) => (
                  <GeoChatComposerAttachment
                    attachment={attachment}
                    removeLabel={removeAttachmentLabel}
                    variant={variant}
                  />
                )}
              </ComposerPrimitive.Attachments>
            </Stack>
          )}

          <Stack
            className={classNames.actions}
            direction="row"
            spacing={isFusion ? 0.5 : 1}
            sx={[
              { alignItems: "center", px: isFusion ? 1 : 1.25, py: isFusion ? 0.5 : 1 },
              ...(Array.isArray(sx.actions) ? sx.actions : [sx.actions]),
            ]}
          >
            <Tooltip title={attachLabel} arrow>
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                <ComposerPrimitive.AddAttachment
                  aria-label={attachLabel}
                  title={attachLabel}
                  disabled={disabled || isRunning || attachmentPending}
                  render={<IconButton size="small" data-copilot-tour={isFusion ? "fusion-attachments" : "attachments"} />}
                >
                  {attachmentPending ? <CircularProgress size={17} /> : <PaperclipIcon size={18} />}
                </ComposerPrimitive.AddAttachment>
              </Box>
            </Tooltip>

            <ComposerPrimitive.Input
              {...inputProps}
              ref={inputRef}
              className={classNames.input}
              placeholder={placeholder}
              aria-label={inputProps?.["aria-label"] ?? placeholder}
              disabled={disabled}
              minRows={1}
              maxRows={isFusion ? 5 : 8}
              submitMode="enter"
              onFocus={onFocus}
              onKeyDown={(event) => {
                customKeyDown?.(event);
                if (!event.defaultPrevented) history.onKeyDown(event);
              }}
              onPaste={(event) => {
                customPaste?.(event);
                if (event.defaultPrevented || event.clipboardData.files.length === 0) return;
                const pastedText = event.clipboardData.getData("text/plain");
                if (!pastedText) return;
                const target = event.currentTarget;
                const insertion = insertTextAtSelection(
                  target.value,
                  pastedText,
                  target.selectionStart,
                  target.selectionEnd,
                );
                aui.composer.setText(insertion.value);
                globalThis.requestAnimationFrame(() => target.setSelectionRange(insertion.cursor, insertion.cursor));
              }}
              style={{
                minWidth: 0,
                width: "100%",
                flex: 1,
                resize: "none",
                border: 0,
                outline: 0,
                background: "transparent",
                color: "inherit",
                font: "inherit",
                lineHeight: "24px",
              }}
            />

            {isRunning && canCancel ? (
              <Tooltip title={stopLabel} arrow>
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                  <ComposerPrimitive.Cancel
                    aria-label={stopLabel}
                    title={stopLabel}
                    render={<IconButton size="small" color="primary" />}
                  >
                    <SquareIcon size={18} />
                  </ComposerPrimitive.Cancel>
                </Box>
              </Tooltip>
            ) : (
              <Tooltip title={sendLabel} arrow>
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                  <ComposerPrimitive.Send
                    aria-label={sendLabel}
                    title={sendLabel}
                    disabled={disabled || attachmentPending}
                    render={<IconButton size="small" color="primary" data-copilot-tour={isFusion ? "fusion-send" : "send"} />}
                  >
                    <SendIcon size={18} />
                  </ComposerPrimitive.Send>
                </Box>
              </Tooltip>
            )}
          </Stack>

          {shownError && (
            <Typography
              className={classNames.error}
              role="alert"
              variant="caption"
              color="error"
              sx={{ display: "block", px: isFusion ? 1 : 1.25, pb: 0.75 }}
            >
              {shownError}
            </Typography>
          )}
        </Box>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.AttachmentDropzone>
  );
}
