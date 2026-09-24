import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import ConstructionRounded from "@mui/icons-material/ConstructionRounded";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import PsychologyRounded from "@mui/icons-material/PsychologyRounded";
import { Box, ButtonBase, CircularProgress, Collapse, Stack, Typography } from "@mui/material";
import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import { AgentDisplayToolResult } from "../chat/AgentDisplayToolResult";
import {
  assistantToolStatus,
  collectAssistantProcessRuns,
  formatToolPayload,
  isAssistantDisplayToolPart,
  summarizeToolInput,
  type AssistantProcess,
  type AssistantProcessPart,
} from "../chat/assistantProcess";
import { STREAMDOWN_PLUGINS } from "../chat/streamdownPlugins";
import { isInternalToolResultEcho } from "../chat/toolResultEcho";
import { useStreamdownTranslations } from "../../i18n/useStreamdownTranslations";
import type { FusionChatMessage } from "./types";

function ToolStatus({ status }: { status: "running" | "done" | "failed" }) {
  if (status === "running") return <CircularProgress size={12} thickness={5} color="inherit" />;
  if (status === "failed") return <ErrorOutlineRounded sx={{ fontSize: 15 }} />;
  return <CheckCircleRounded sx={{ fontSize: 14 }} />;
}

function ToolRow({ part }: { part: AssistantProcessPart }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const status = assistantToolStatus(part);
  const toolName = part.type.slice(5);
  const preview = summarizeToolInput(part.input);
  const details = formatToolPayload(part.output ?? part.errorText ?? part.input);
  return (
    <Box>
      <ButtonBase
        component="button"
        type="button"
        disabled={!details}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={details ? expanded : undefined}
        sx={{
          width: "100%",
          minHeight: 27,
          px: 0.5,
          gap: 0.55,
          borderRadius: 1,
          justifyContent: "flex-start",
          color: status === "failed" ? "error.main" : "text.secondary",
          textAlign: "left",
          "&:hover": { bgcolor: details ? "action.hover" : "transparent" },
        }}
      >
        <ToolStatus status={status} />
        <Typography component="code" variant="caption" sx={{ fontWeight: 750 }}>{toolName}</Typography>
        <Typography variant="caption" noWrap sx={{ minWidth: 0, flex: 1, color: "text.secondary" }}>{preview}</Typography>
        <Typography variant="caption" sx={{ flex: "0 0 auto" }}>{t(`tools.${status}`)}</Typography>
        {details && <KeyboardArrowDownRounded sx={{ fontSize: 16, transform: expanded ? "rotate(180deg)" : "none" }} />}
      </ButtonBase>
      <Collapse in={expanded} timeout={reduceMotion ? 0 : 160} unmountOnExit>
        <Box component="pre" sx={{ m: 0.5, p: 0.75, maxHeight: 180, overflow: "auto", borderRadius: 1, bgcolor: "action.hover", fontSize: 10.5, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {details}
        </Box>
      </Collapse>
    </Box>
  );
}

function ProcessCard({ process, active }: { process: AssistantProcess; active: boolean }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(active || process.hasFailure || !process.hasFinalContent);
  const summary = process.toolCount > 0
    ? `${process.reasoningCount > 0 ? (active ? t("panel.process.active") : t("panel.process.complete")) : t("panel.process.toolsOnly")} · ${t(process.toolCount === 1 ? "panel.process.toolCountOne" : "panel.process.toolCountMany", { count: process.toolCount })}`
    : active ? t("panel.process.active") : t("panel.process.complete");
  return (
    <Box sx={{ mb: 0.5, border: 1, borderColor: process.hasFailure ? "error.light" : "divider", borderRadius: 1.25, bgcolor: process.hasFailure ? "rgba(211,47,47,.06)" : "background.default", overflow: "hidden" }}>
      <ButtonBase component="button" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} sx={{ width: "100%", minHeight: 30, px: 0.75, justifyContent: "space-between", color: process.hasFailure ? "error.main" : "text.secondary" }}>
        <Stack direction="row" spacing={0.55} sx={{ minWidth: 0, alignItems: "center" }}>
          {process.reasoningCount > 0 ? <PsychologyRounded sx={{ fontSize: 15 }} /> : <ConstructionRounded sx={{ fontSize: 15 }} />}
          <Typography variant="caption" noWrap sx={{ fontWeight: 750 }}>{summary}</Typography>
        </Stack>
        <KeyboardArrowDownRounded sx={{ fontSize: 17, transform: expanded ? "rotate(180deg)" : "none" }} />
      </ButtonBase>
      <Collapse in={expanded} timeout={reduceMotion ? 0 : 170} unmountOnExit>
        <Box sx={{ px: 0.5, pb: 0.5, borderTop: 1, borderColor: "divider" }}>
          {process.entries.map(({ index, part }) => part.type === "reasoning" ? (
            <Box key={index} sx={{ px: 0.5, py: 0.65 }}>
              <Typography variant="caption" sx={{ display: "block", mb: 0.25, color: "text.secondary", fontWeight: 750 }}>{t("panel.process.reasoning")}</Typography>
              <Typography variant="caption" component="div" sx={{ color: "text.secondary", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.5 }}>{part.text}</Typography>
            </Box>
          ) : <ToolRow key={index} part={part} />)}
        </Box>
      </Collapse>
    </Box>
  );
}

export function FusionAssistantMessage({ message, active }: { message: FusionChatMessage; active: boolean }) {
  const { i18n, t } = useTranslation();
  const translations = useStreamdownTranslations();
  const processRuns = collectAssistantProcessRuns(
    message.parts,
    isAssistantDisplayToolPart,
    (_part, index) => isInternalToolResultEcho(message.parts, index),
  );
  const processByFirstIndex = new Map(processRuns.map((process) => [process.firstIndex, process]));
  const processIndexes = new Set(processRuns.flatMap((process) => process.entries.map(({ index }) => index)));
  const activeProcessIndex = processRuns.at(-1)?.firstIndex;

  return message.parts.map((part, index) => {
    const process = processByFirstIndex.get(index);
    if (process) return <ProcessCard key={`process:${index}`} process={process} active={active && index === activeProcessIndex && !process.hasFinalContent} />;
    if (processIndexes.has(index)) return null;
    if (part.type === "text") {
      if (isInternalToolResultEcho(message.parts, index)) return null;
      return (
        <Box key={`text:${index}`} className="fusion-mode-markdown">
          <Streamdown animated={false} isAnimating={active} caret="block" plugins={STREAMDOWN_PLUGINS} translations={translations}>
            {part.text}
          </Streamdown>
        </Box>
      );
    }
    if (part.type === "file") {
      return <Typography key={`file:${index}`} variant="caption" color="text.secondary">{part.filename ?? part.mediaType}</Typography>;
    }
    if (isAssistantDisplayToolPart(part)) {
      return (
        <AgentDisplayToolResult
          key={`tool:${index}`}
          part={part}
          locale={i18n.language.startsWith("en") ? "en-US" : "zh-CN"}
          statusLabel={t(`tools.${assistantToolStatus(part)}`)}
        />
      );
    }
    return null;
  });
}
