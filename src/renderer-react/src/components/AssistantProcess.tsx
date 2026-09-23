import {
  Box,
  ButtonBase,
  CircularProgress,
  Collapse,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import ConstructionRounded from "@mui/icons-material/ConstructionRounded";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import KeyboardArrowDownRounded from "@mui/icons-material/KeyboardArrowDownRounded";
import PsychologyRounded from "@mui/icons-material/PsychologyRounded";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  assistantToolStatus,
  formatToolPayload,
  shouldExpandAssistantProcess,
  summarizeToolInput,
  type AssistantProcess as AssistantProcessModel,
  type AssistantProcessPart,
} from "../features/chat/assistantProcess";

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

function ToolStatusIcon({ status }: { status: "running" | "done" | "failed" }) {
  if (status === "running") return <CircularProgress size={13} thickness={5} color="inherit" />;
  if (status === "failed") return <ErrorOutlineRounded sx={{ fontSize: 16 }} />;
  return <CheckCircleRounded sx={{ fontSize: 15 }} />;
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

function ToolCallRow({ labels, part }: { labels: ProcessLabels; part: AssistantProcessPart }) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const status = assistantToolStatus(part);
  const toolName = part.type.slice(5);
  const preview = summarizeToolInput(part.input);
  const hasDetails = part.input !== undefined || part.output !== undefined || part.errorText !== undefined;

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
        <Typography
          component="code"
          variant="caption"
          sx={{ ml: 0.35, flex: "0 0 auto", color: "inherit", fontWeight: 700 }}
        >
          {toolName}
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
          <KeyboardArrowDownRounded
            sx={{
              ml: 0.25,
              fontSize: 17,
              flex: "0 0 auto",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: reduceMotion ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        )}
      </ButtonBase>
      <Collapse in={expanded} timeout={reduceMotion ? 0 : 180} unmountOnExit>
        <Stack spacing={0.75} sx={{ pl: 3.1, pr: 0.5, pt: 0.5, pb: 0.75 }}>
          <Payload label={labels.input} value={part.input} />
          <Payload label={labels.output} value={part.output} />
          <Payload label={labels.error} value={part.errorText} />
        </Stack>
      </Collapse>
    </Box>
  );
}

export function AssistantProcess({ active, labels, process }: {
  active: boolean;
  labels: ProcessLabels;
  process: AssistantProcessModel;
}) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(() => shouldExpandAssistantProcess(process, active));
  const wasActive = useRef(active);

  useEffect(() => {
    if (process.hasFailure) {
      setExpanded(true);
    } else if (wasActive.current && !active) {
      setExpanded(!process.hasFinalContent);
    } else if (!wasActive.current && active) {
      setExpanded(true);
    }
    wasActive.current = active;
  }, [active, process.hasFailure, process.hasFinalContent]);

  const summary = process.toolCount > 0
    ? `${process.reasoningCount > 0 ? (active ? labels.active : labels.complete) : labels.toolsOnly} · ${labels.toolCount(process.toolCount)}`
    : active ? labels.active : labels.complete;

  return (
    <Box
      sx={{
        mb: 0.75,
        borderRadius: 1.25,
        border: 1,
        borderColor: process.hasFailure ? "error.light" : "divider",
        bgcolor: process.hasFailure ? "rgba(211, 47, 47, 0.06)" : "background.paper",
        color: process.hasFailure ? "error.main" : "text.secondary",
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
          {process.reasoningCount > 0
            ? <PsychologyRounded sx={{ fontSize: 16 }} />
            : <ConstructionRounded sx={{ fontSize: 16 }} />}
          <Typography variant="caption" sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {summary}
          </Typography>
        </Stack>
        <KeyboardArrowDownRounded
          sx={{
            ml: 0.75,
            fontSize: 18,
            flex: "0 0 auto",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: reduceMotion ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </ButtonBase>
      <Collapse in={expanded} timeout={reduceMotion ? 0 : 190} unmountOnExit>
        <Box sx={{ px: 1, pb: 0.75, borderTop: 1, borderColor: "divider" }}>
          {process.entries.map(({ index, part }) => part.type === "reasoning" ? (
            <Box key={index} sx={{ pt: 0.8, pb: 0.5 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: 0.35, color: "text.secondary" }}>
                <PsychologyRounded sx={{ fontSize: 15 }} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{labels.reasoning}</Typography>
              </Stack>
              <Typography
                variant="caption"
                component="div"
                sx={{ pl: 2.5, color: "text.secondary", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.55 }}
              >
                {part.text}
              </Typography>
            </Box>
          ) : (
            <ToolCallRow key={index} labels={labels} part={part} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
