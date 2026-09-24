import { Box, Chip, CircularProgress, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  choiceScenarioCardKey,
  previewChoiceScenario,
  type ChoiceScenarioPreviewInput
} from "../geogebra/choiceScenario";
import type { Locale } from "../../../../shared/desktop/locale";
import { Streamdown } from "streamdown";
import { STREAMDOWN_PLUGINS } from "./streamdownPlugins";
import { isAssistantDisplayToolPart } from "./assistantProcess";
import { useStreamdownTranslations } from "../../i18n/useStreamdownTranslations";

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: unknown;
};

type ToolCard = {
  title?: string;
  summary?: string;
  answer?: string;
  steps?: Array<{ label?: string; body?: string }>;
  items?: string[];
  controls?: string[];
  observations?: string[];
  baseConditions?: string[];
  auxiliaryElementReview?: string;
  choices?: Array<{
    label?: string;
    statement?: string;
    verdict?: string;
    explanation?: string;
    constructionFocus?: string;
    evidence?: string[];
    commands?: string[];
  }>;
  elements?: Array<{ label?: string; type?: string; description?: string; role?: string }>;
  nextActionHint?: string;
};

type CardLabels = {
  answer: string;
  steps: string;
  hints: string;
  controls: string;
  observations: string;
  baseConditions: string;
  auxiliary: string;
  selected: string;
  nextAction: string;
  focus: string;
  evidence: string;
  commands: string;
  type: string;
  role: string;
  true: string;
  false: string;
  unknown: string;
  choiceAll: string;
  choicePreviewing: string;
};

const labels: Record<"zh-CN" | "en-US", CardLabels> = {
  "zh-CN": {
    answer: "答案",
    steps: "解题步骤",
    hints: "提示",
    controls: "操作对象",
    observations: "观察重点",
    baseConditions: "公共条件",
    auxiliary: "辅助对象",
    selected: "已选对象",
    nextAction: "下一步",
    focus: "画板焦点",
    evidence: "依据",
    commands: "对应命令",
    type: "类型",
    role: "作用",
    true: "正确",
    false: "错误",
    unknown: "待确认",
    choiceAll: "全部",
    choicePreviewing: "正在画板上演示…",
  },
  "en-US": {
    answer: "Answer",
    steps: "Steps",
    hints: "Hints",
    controls: "Controls",
    observations: "Observe",
    baseConditions: "Shared conditions",
    auxiliary: "Auxiliary elements",
    selected: "Selected elements",
    nextAction: "Next action",
    focus: "Canvas focus",
    evidence: "Evidence",
    commands: "Commands",
    type: "Type",
    role: "Role",
    true: "True",
    false: "False",
    unknown: "Uncertain",
    choiceAll: "All",
    choicePreviewing: "Drawing on the canvas…",
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => stringValue(item) ? [item] : []) : undefined;
}

function objectList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function toCard(value: unknown): ToolCard | null {
  if (!isRecord(value)) return null;
  const result = isRecord(value.result) ? value.result : value;
  if (!isRecord(result)) return null;
  const card: ToolCard = {
    title: stringValue(result.title),
    summary: stringValue(result.summary),
    answer: stringValue(result.answer),
    items: stringList(result.items),
    controls: stringList(result.controls),
    observations: stringList(result.observations),
    baseConditions: stringList(result.baseConditions),
    auxiliaryElementReview: stringValue(result.auxiliaryElementReview),
    nextActionHint: stringValue(result.nextActionHint),
    steps: objectList(result.steps).map((step) => ({ label: stringValue(step.label), body: stringValue(step.body) })),
    choices: objectList(result.choices).map((choice) => ({
      label: stringValue(choice.label),
      statement: stringValue(choice.statement),
      verdict: stringValue(choice.verdict),
      explanation: stringValue(choice.explanation),
      constructionFocus: stringValue(choice.constructionFocus),
      evidence: stringList(choice.evidence),
      commands: stringList(choice.commands),
    })),
    elements: objectList(result.elements).map((element) => ({
      label: stringValue(element.label),
      type: stringValue(element.type),
      description: stringValue(element.description),
      role: stringValue(element.role),
    })),
  };
  return card.title || card.summary || card.answer || card.steps?.length || card.choices?.length || card.elements?.length ? card : null;
}

function Markdown({ children }: { children: string }) {
  const translations = useStreamdownTranslations();
  return <Streamdown className="copilot-markdown" plugins={STREAMDOWN_PLUGINS} translations={translations}>{children}</Streamdown>;
}

function MarkdownList({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <Box component="ul">
      {items.map((item, index) => <Box component="li" key={`${item}-${index}`}><Markdown>{item}</Markdown></Box>)}
    </Box>
  );
}

function Verdict({ value, copy }: { value?: string; copy: CardLabels }) {
  const normalized = value === "true" || value === "false" ? value : "unknown";
  return <Chip size="small" label={copy[normalized]} />;
}

export function isAgentDisplayToolPart(part: unknown): part is ToolPart {
  return isAssistantDisplayToolPart(part);
}

export function AgentDisplayToolResult({ part, locale, statusLabel }: { part: ToolPart; locale: "zh-CN" | "en-US"; statusLabel: string }) {
  const toolName = part.type.slice(5);
  const copy = labels[locale];
  const card = toCard(part.output) ?? toCard(part.input);
  const error = stringValue(part.errorText);

  if (!card) {
    return (
      <Stack direction="row" spacing={0.5}>
        <Typography variant="caption">{toolName}: {statusLabel}{error ? ` (${error})` : ""}</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0.75}>
      {card.title && <Typography variant="subtitle2">{card.title}</Typography>}
      {card.summary && <Markdown>{card.summary}</Markdown>}
      {card.answer && <Stack spacing={0.25}><Typography variant="caption" color="text.secondary">{copy.answer}</Typography><Markdown>{card.answer}</Markdown></Stack>}
      {toolName === "showSolutionSteps" && card.steps?.length ? <Stack spacing={0.5}><Typography variant="caption" color="text.secondary">{copy.steps}</Typography><Box component="ol">{card.steps.map((step, index) => <Box component="li" key={`${step.label}-${index}`}><Typography component="span" variant="body2"><strong>{step.label}</strong></Typography>{step.body && <Markdown>{step.body}</Markdown>}</Box>)}</Box></Stack> : null}
      {toolName === "showTeachingHint" && <Stack spacing={0.25}><Typography variant="caption" color="text.secondary">{copy.hints}</Typography><MarkdownList items={card.items} /></Stack>}
      {toolName === "showAnimationGuide" && <>
        <Stack spacing={0.25}><Typography variant="caption" color="text.secondary">{copy.controls}</Typography><MarkdownList items={card.controls} /></Stack>
        <Stack spacing={0.25}><Typography variant="caption" color="text.secondary">{copy.observations}</Typography><MarkdownList items={card.observations} /></Stack>
      </>}
      {toolName === "showChoiceAnalysis" && <ChoiceAnalysis card={card} copy={copy} />}
      {toolName === "showSelectedElements" && <Stack spacing={0.5}><Typography variant="caption" color="text.secondary">{copy.selected}</Typography>{card.elements?.map((element, index) => <Stack spacing={0.25} key={`${element.label}-${index}`}><Typography component="code" variant="body2">{element.label}</Typography>{element.type && <Typography variant="caption">{copy.type}: {element.type}</Typography>}{element.description && <Markdown>{element.description}</Markdown>}{element.role && <Typography variant="body2"><strong>{copy.role}: </strong>{element.role}</Typography>}</Stack>)}{card.nextActionHint && <Typography variant="body2"><strong>{copy.nextAction}: </strong>{card.nextActionHint}</Typography>}</Stack>}
      {card.auxiliaryElementReview && <Stack spacing={0.25}><Typography variant="caption" color="text.secondary">{copy.auxiliary}</Typography><Markdown>{card.auxiliaryElementReview}</Markdown></Stack>}
      {part.state !== "output-available" && <Typography variant="caption" color="text.secondary">{toolName}: {statusLabel}{error ? ` (${error})` : ""}</Typography>}
    </Stack>
  );
}

const ALL_CHOICES = "all";

/**
 * Choice analysis, one option at a time.
 *
 * Every option's construction drawn at once overlaps into noise, so selecting
 * a tab replays that option alone onto the canvas, from the construction as it
 * stood when the card first appeared. "All" returns to that baseline and shows
 * every option's reasoning together, without drawing any of them.
 *
 * Preview is best-effort: the reasoning is readable whether or not the canvas
 * cooperates, so a failed replay reports itself under the tabs and leaves the
 * text alone.
 */
function ChoiceAnalysis({ card, copy }: { card: ToolCard; copy: CardLabels }) {
  const { i18n } = useTranslation();
  const choices = useMemo(() => card.choices ?? [], [card.choices]);
  const cardKey = useMemo(() => choiceScenarioCardKey(card), [card]);
  const [active, setActive] = useState<string>(ALL_CHOICES);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Tabs can be clicked faster than a replay finishes; only the newest run may
  // report, or a slow earlier one overwrites the current state.
  const runRef = useRef(0);

  useEffect(() => {
    if (active === ALL_CHOICES) return;
    if (!choices.some((choice) => choice.label === active)) setActive(ALL_CHOICES);
  }, [active, choices]);

  const visible = active === ALL_CHOICES ? choices : choices.filter((choice) => choice.label === active);

  const preview = async (label: string, commands: string[]) => {
    setActive(label);
    setPreviewError(null);
    const run = ++runRef.current;
    setPreviewing(label);
    const input: ChoiceScenarioPreviewInput = { cardKey, label, commands };
    const locale: Locale = i18n.language.startsWith("en") ? "en-US" : "zh-CN";
    try {
      const result = await previewChoiceScenario(input, locale);
      if (run === runRef.current && !result.ok && result.error) setPreviewError(result.error);
    } finally {
      if (run === runRef.current) setPreviewing(null);
    }
  };

  return (
    <>
      {card.baseConditions?.length ? (
        <Stack spacing={0.25}>
          <Typography variant="caption" color="text.secondary">{copy.baseConditions}</Typography>
          <MarkdownList items={card.baseConditions} />
        </Stack>
      ) : null}

      {choices.length > 1 ? (
        <Stack spacing={0.5}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={active}
            sx={{ flexWrap: "wrap", gap: 0.5, "& .MuiToggleButton-root": { px: 1, py: 0.25, border: 1, borderColor: "divider", borderRadius: 1, textTransform: "none" } }}
          >
            {choices.map((choice, index) => (
              <ToggleButton
                key={`${choice.label}-${index}`}
                value={choice.label ?? ""}
                onClick={() => void preview(choice.label ?? "", choice.commands ?? [])}
              >
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{choice.label}</Typography>
              </ToggleButton>
            ))}
            {/* Returning to "all" is a replay with no commands, which is what
                restores the canvas to the construction the card started from. */}
            <ToggleButton value={ALL_CHOICES} onClick={() => void preview(ALL_CHOICES, [])}>
              <Typography variant="caption">{copy.choiceAll}</Typography>
            </ToggleButton>
          </ToggleButtonGroup>
          {previewing ? (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <CircularProgress size={12} />
              <Typography variant="caption" color="text.secondary">{copy.choicePreviewing}</Typography>
            </Stack>
          ) : null}
          {previewError ? <Typography variant="caption" color="error.main">{previewError}</Typography> : null}
        </Stack>
      ) : null}

      {visible.map((choice, index) => (
        <Stack spacing={0.25} key={`${choice.label}-${index}`}>
          <Stack direction="row" spacing={0.5}><Typography variant="subtitle2">{choice.label}</Typography><Verdict value={choice.verdict} copy={copy} /></Stack>
          {choice.statement && <Markdown>{choice.statement}</Markdown>}
          {choice.explanation && <Markdown>{choice.explanation}</Markdown>}
          {choice.constructionFocus && <Typography variant="body2"><strong>{copy.focus}: </strong>{choice.constructionFocus}</Typography>}
          {choice.evidence?.length ? <Stack spacing={0.25}><Typography variant="caption" color="text.secondary">{copy.evidence}</Typography><MarkdownList items={choice.evidence} /></Stack> : null}
          {choice.commands?.length ? <Stack spacing={0.25}><Typography variant="caption" color="text.secondary">{copy.commands}</Typography>{choice.commands.map((command, commandIndex) => <Typography component="code" variant="caption" key={`${command}-${commandIndex}`}>{command}</Typography>)}</Stack> : null}
        </Stack>
      ))}
    </>
  );
}
