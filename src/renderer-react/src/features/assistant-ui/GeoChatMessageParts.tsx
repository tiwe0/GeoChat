import {
  groupPartByType,
  MessagePrimitive,
  useAuiState,
  type FileMessagePartProps,
  type ImageMessagePartProps,
  type ReasoningMessagePartProps,
  type SourceMessagePartProps,
  type TextMessagePartProps,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import {
  Box,
  ButtonBase,
  CircularProgress,
  Collapse,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import {
  BrainIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckBigIcon,
  ConstructionIcon,
  FileTextIcon,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import { AgentDisplayToolResult } from "../chat/AgentDisplayToolResult";
import { StaticMessageMarkdown } from "../chat/StaticMessageMarkdown";
import { STREAMDOWN_PLUGINS } from "../chat/streamdownPlugins";
import { useStreamdownTranslations } from "../../i18n/useStreamdownTranslations";
import {
  GEOCHAT_DISPLAY_TOOL_NAMES,
  assistantUiToolStatus,
  formatToolPayload,
  isGeoChatDisplayToolName,
  summarizeToolInput,
} from "./toolPresentation";

export type GeoChatMessageSurface = "window" | "transcript" | "spatial";

export type GeoChatMessageContentProps = {
  className?: string;
  showDisplayTools?: boolean;
  surface?: GeoChatMessageSurface;
};

type ProcessLabels = {
  active: string;
  complete: string;
  toolsOnly: string;
  toolCount: (count: number) => string;
  expand: string;
  collapse: string;
  reasoning: string;
  input: string;
  output: string;
  error: string;
  status: (status: "running" | "done" | "failed") => string;
};

function errorText(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function processLabels(t: ReturnType<typeof useTranslation>["t"]): ProcessLabels {
  return {
    active: t("panel.process.active"),
    complete: t("panel.process.complete"),
    toolsOnly: t("panel.process.toolsOnly"),
    toolCount: (count) => t(
      count === 1 ? "panel.process.toolCountOne" : "panel.process.toolCountMany",
      { count },
    ),
    expand: t("panel.process.expand"),
    collapse: t("panel.process.collapse"),
    reasoning: t("panel.process.reasoning"),
    input: t("panel.process.input"),
    output: t("panel.process.output"),
    error: t("panel.process.error"),
    status: (status) => t(`tools.${status}`),
  };
}

function GeoChatTextPart({ text, status }: TextMessagePartProps) {
  const role = useAuiState((state) => state.message.role);
  const translations = useStreamdownTranslations();
  if (!text) return <></>;
  if (role === "assistant") {
    return (
      <Streamdown
        animated={false}
        isAnimating={status.type === "running"}
        caret="block"
        className="copilot-markdown"
        plugins={STREAMDOWN_PLUGINS}
        translations={translations}
      >
        {text}
      </Streamdown>
    );
  }
  return <StaticMessageMarkdown>{text}</StaticMessageMarkdown>;
}

function GeoChatFilePart({ data, filename, mimeType }: FileMessagePartProps) {
  const { t } = useTranslation();
  if (mimeType.startsWith("image/")) {
    return (
      <Box
        component="img"
        src={data}
        alt={filename ?? t("composer.attachedImage")}
        loading="lazy"
        sx={{
          display: "block",
          width: "100%",
          maxHeight: 180,
          objectFit: "contain",
          borderRadius: 1,
          bgcolor: "background.default",
        }}
      />
    );
  }
  return (
    <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center" }}>
      <FileTextIcon size={18} style={{ flex: "0 0 auto" }} />
      <Typography variant="caption" noWrap title={filename}>
        {filename ?? t("common.attachment")}
      </Typography>
    </Stack>
  );
}

function GeoChatImagePart({ image, filename }: ImageMessagePartProps) {
  const { t } = useTranslation();
  return (
    <Box
      component="img"
      src={image}
      alt={filename ?? t("composer.attachedImage")}
      loading="lazy"
      sx={{
        display: "block",
        width: "100%",
        maxHeight: 180,
        objectFit: "contain",
        borderRadius: 1,
        bgcolor: "background.default",
      }}
    />
  );
}

function GeoChatSourcePart(part: SourceMessagePartProps) {
  if (part.sourceType === "url") {
    return (
      <Link href={part.url} target="_blank" rel="noreferrer" variant="caption" sx={{ overflowWrap: "anywhere" }}>
        {part.title ?? part.url}
      </Link>
    );
  }
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>
      {part.title || part.filename}
    </Typography>
  );
}

function Payload({ label, value }: { label: string; value: unknown }) {
  const formatted = formatToolPayload(value);
  if (!formatted) return null;
  return (
    <Box>
      <Typography variant="caption" sx={{ display: "block", mb: 0.35, color: "text.secondary", fontWeight: 650 }}>
        {label}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 0.75,
          maxHeight: 200,
          overflow: "auto",
          borderRadius: 1,
          bgcolor: "action.hover",
          color: "text.primary",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "0.6875rem",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {formatted}
      </Box>
    </Box>
  );
}

function ToolStatusIcon({ status }: { status: "running" | "done" | "failed" }) {
  if (status === "running") return <CircularProgress size={13} thickness={5} color="inherit" />;
  if (status === "failed") return <CircleAlertIcon size={16} />;
  return <CircleCheckBigIcon size={15} />;
}

function GeoChatToolPart(part: ToolCallMessagePartProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const labels = processLabels(t);
  const status = assistantUiToolStatus(part.status, part.isError);
  const preview = summarizeToolInput(part.args);
  const partError = part.isError || part.status.type === "incomplete"
    ? errorText(part.result) ?? ("error" in part.status ? errorText(part.status.error) : undefined)
    : undefined;
  const hasDetails = part.args !== undefined || part.result !== undefined || partError !== undefined;

  return (
    <Box sx={{ py: 0.25 }}>
      <ButtonBase
        component="button"
        type="button"
        disabled={!hasDetails}
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={hasDetails ? expanded : undefined}
        aria-label={hasDetails ? (expanded ? labels.collapse : labels.expand) : undefined}
        sx={{
          width: "100%",
          minHeight: 28,
          px: 0.5,
          borderRadius: 1,
          justifyContent: "flex-start",
          color: status === "failed" ? "error.main" : "text.secondary",
          textAlign: "left",
          "&:hover": { bgcolor: hasDetails ? "action.hover" : "transparent" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
          "&.Mui-disabled": { color: status === "failed" ? "error.main" : "text.secondary" },
        }}
      >
        <Box sx={{ width: 20, display: "grid", placeItems: "center", flex: "0 0 auto" }}>
          <ToolStatusIcon status={status} />
        </Box>
        <Typography component="code" variant="caption" sx={{ ml: 0.35, flex: "0 0 auto", color: "inherit", fontWeight: 700 }}>
          {part.toolName}
        </Typography>
        {preview ? (
          <Typography
            variant="caption"
            sx={{ ml: 0.75, minWidth: 0, flex: 1, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {preview}
          </Typography>
        ) : <Box sx={{ flex: 1 }} />}
        <Typography variant="caption" sx={{ ml: 0.75, flex: "0 0 auto", color: "inherit" }}>
          {labels.status(status)}
        </Typography>
        {hasDetails && (
          <ChevronDownIcon
            size={17}
            style={{
              marginLeft: 2,
              flex: "0 0 auto",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: reduceMotion ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        )}
      </ButtonBase>
      <Collapse in={expanded} timeout={reduceMotion ? 0 : 180} unmountOnExit>
        <Stack spacing={0.75} sx={{ pl: 3.1, pr: 0.5, pt: 0.5, pb: 0.75 }}>
          <Payload label={labels.input} value={part.args} />
          <Payload label={labels.output} value={part.result} />
          <Payload label={labels.error} value={partError} />
        </Stack>
      </Collapse>
    </Box>
  );
}

function GeoChatReasoningPart({ text }: ReasoningMessagePartProps) {
  if (!text.trim()) return <></>;
  return (
    <Typography
      variant="caption"
      component="div"
      sx={{ pl: 2.5, color: "text.secondary", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.55 }}
    >
      {text}
    </Typography>
  );
}

function GeoChatReasoningGroup({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Box sx={{ pt: 0.8, pb: 0.5 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: 0.35, color: "text.secondary" }}>
        <BrainIcon size={15} />
        <Typography variant="caption" sx={{ fontWeight: 700 }}>{t("panel.process.reasoning")}</Typography>
      </Stack>
      {children}
    </Box>
  );
}

function AssistantProcessGroup({ children, indices, status }: {
  children: ReactNode;
  indices: readonly number[];
  status: { type: string };
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const parts = useAuiState((state) => state.message.parts);
  const labels = processLabels(t);
  const groupedParts = indices.flatMap((index) => parts[index] ? [parts[index]] : []);
  const reasoningCount = groupedParts.filter((part) => part.type === "reasoning").length;
  const toolCount = groupedParts.filter((part) => part.type === "tool-call").length;
  const lastIndex = indices.at(-1) ?? -1;
  const hasFailure = groupedParts.some((part) => part.status.type === "incomplete");
  const hasFinalContent = parts.some((part, index) => {
    if (index <= lastIndex) return false;
    if (part.type === "text" || part.type === "reasoning") return part.text.trim().length > 0;
    if (part.type === "file" || part.type === "image" || part.type === "source") return true;
    return part.type === "tool-call" && isGeoChatDisplayToolName(part.toolName);
  });
  const active = status.type === "running" || status.type === "requires-action";
  const [expanded, setExpanded] = useState(() => active || hasFailure || !hasFinalContent);
  const wasActive = useRef(active);

  useEffect(() => {
    if (hasFailure) setExpanded(true);
    else if (wasActive.current && !active) setExpanded(!hasFinalContent);
    else if (!wasActive.current && active) setExpanded(true);
    wasActive.current = active;
  }, [active, hasFailure, hasFinalContent]);

  const summary = toolCount > 0
    ? `${reasoningCount > 0 ? (active ? labels.active : labels.complete) : labels.toolsOnly} · ${labels.toolCount(toolCount)}`
    : active ? labels.active : labels.complete;

  return (
    <Box
      sx={{
        mb: 0.75,
        borderRadius: 1.25,
        border: 1,
        borderColor: hasFailure ? "error.light" : "divider",
        bgcolor: hasFailure ? "rgba(211, 47, 47, 0.06)" : "background.paper",
        color: hasFailure ? "error.main" : "text.secondary",
        overflow: "hidden",
      }}
    >
      <ButtonBase
        component="button"
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-label={expanded ? labels.collapse : labels.expand}
        sx={{
          width: "100%",
          minHeight: 34,
          px: 1,
          justifyContent: "space-between",
          color: "inherit",
          textAlign: "left",
          "&:hover": { bgcolor: "action.hover" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
        }}
      >
        <Stack direction="row" spacing={0.65} sx={{ alignItems: "center", minWidth: 0 }}>
          {reasoningCount > 0 ? <BrainIcon size={16} /> : <ConstructionIcon size={16} />}
          <Typography variant="caption" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {summary}
          </Typography>
        </Stack>
        <ChevronDownIcon
          size={18}
          style={{
            marginLeft: 6,
            flex: "0 0 auto",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: reduceMotion ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </ButtonBase>
      <Collapse in={expanded} timeout={reduceMotion ? 0 : 190} unmountOnExit>
        <Box sx={{ px: 1, pb: 0.75, borderTop: 1, borderColor: "divider" }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

export function GeoChatDisplayToolPart(part: ToolCallMessagePartProps) {
  const { i18n, t } = useTranslation();
  const status = assistantUiToolStatus(part.status, part.isError);
  if (!isGeoChatDisplayToolName(part.toolName)) return <></>;
  return (
    <AgentDisplayToolResult
      part={part}
      locale={i18n.language.startsWith("en") ? "en-US" : "zh-CN"}
      statusLabel={t(`tools.${status}`)}
    />
  );
}

const DISPLAY_TOOL_GROUPS = Object.fromEntries(
  GEOCHAT_DISPLAY_TOOL_NAMES.map((name) => [`tool-call:${name}`, [] as const]),
) as Record<`tool-call:${string}`, readonly []>;

const GROUP_ASSISTANT_PROCESS_PARTS = groupPartByType<"group-process" | "group-reasoning" | "group-tools">({
  reasoning: ["group-process", "group-reasoning"],
  "tool-call": ["group-process", "group-tools"],
  ...DISPLAY_TOOL_GROUPS,
});

function GeoChatGroupedMessageParts({ showDisplayTools }: { showDisplayTools: boolean }) {
  const { t } = useTranslation();
  return (
    <MessagePrimitive.GroupedParts groupBy={GROUP_ASSISTANT_PROCESS_PARTS} indicator="empty">
      {({ part, children }) => {
        if (part.type === "group-process") {
          return <AssistantProcessGroup indices={part.indices} status={part.status}>{children}</AssistantProcessGroup>;
        }
        if (part.type === "group-reasoning") return <GeoChatReasoningGroup>{children}</GeoChatReasoningGroup>;
        if (part.type === "group-tools") return <>{children}</>;
        if (part.type === "indicator") {
          return (
            <Stack direction="row" spacing={0.75} role="status" aria-live="polite" sx={{ alignItems: "center", py: 0.5 }}>
              <CircularProgress size={13} />
              <Typography variant="caption" color="text.secondary">{t("fusion.thinking")}</Typography>
            </Stack>
          );
        }
        if (part.type === "text") return <GeoChatTextPart {...part} />;
        if (part.type === "reasoning") return <GeoChatReasoningPart {...part} />;
        if (part.type === "source") return <GeoChatSourcePart {...part} />;
        if (part.type === "image") return <GeoChatImagePart {...part} />;
        if (part.type === "file") return <GeoChatFilePart {...part} />;
        if (part.type === "tool-call") {
          if (isGeoChatDisplayToolName(part.toolName)) {
            return showDisplayTools ? <GeoChatDisplayToolPart {...part} /> : <></>;
          }
          return <GeoChatToolPart {...part} />;
        }
        return <></>;
      }}
    </MessagePrimitive.GroupedParts>
  );
}

export function GeoChatMessageContent({
  className,
  showDisplayTools = true,
  surface = "window",
}: GeoChatMessageContentProps) {
  const { t } = useTranslation();
  const messageError = useAuiState((state) => (
    state.message.status?.type === "incomplete"
      ? errorText(state.message.status.error)
      : undefined
  ));
  return (
    <Box
      className={className}
      data-geochat-message-content="true"
      data-message-surface={surface}
      sx={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <GeoChatGroupedMessageParts showDisplayTools={showDisplayTools} />
      <MessagePrimitive.Error>
        <Typography role="alert" variant="caption" color="error" sx={{ display: "block", mt: 0.75 }}>
          {messageError ?? t("common.error")}
        </Typography>
      </MessagePrimitive.Error>
    </Box>
  );
}
