import {
  agentRunRequiresChoiceAnalysis,
  isAgentRunRemoteToolRequestInput,
  isAgentRunToolCallId,
  isChoiceAnalysisPrompt,
  isFunctionCallArgs,
  isFunctionCallToolName,
  type AgentRunLedgerRecord,
  type AgentRunModelStepDetails,
  type AgentRunRemoteToolRequestInput,
  type AgentRunUsage,
  type FunctionCallToolName
} from "@geochat-ai/app";

export type ToolCallLike = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type ModelResultLike = {
  toolCalls: ToolCallLike[];
  text: string;
  totalUsage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export type BackendModelResultAction =
  | {
      type: "tool";
      source: "model";
      tool: AgentRunRemoteToolRequestInput;
      diagnostics?: AgentRunModelStepDetails;
    }
  | {
      type: "finish";
      source: "model";
      text: string;
      usage?: AgentRunUsage;
    };

export function backendActionFromModelResult(result: ModelResultLike, run: Pick<AgentRunLedgerRecord, "locale" | "prompt" | "tools">): BackendModelResultAction {
  const locale = run.locale;
  const nextToolCall = result.toolCalls[0];
  if (nextToolCall) {
    if (nextToolCall.toolName === "setFinished") {
      if (!isAgentRunToolCallId(nextToolCall.toolCallId)) {
        throw new Error(isEnglishLocale(locale) ? "The model returned an invalid tool call ID." : "模型返回了非法工具调用 ID。");
      }
      const finishInput = normalizeModelToolInput(nextToolCall.toolName, nextToolCall.input);
      if (!isFunctionCallArgs(nextToolCall.toolName, finishInput)) {
        throw new Error(isEnglishLocale(locale) ? "The model returned invalid tool arguments: setFinished" : "模型返回了非法工具参数：setFinished");
      }
      if (agentRunRequiresChoiceAnalysis(run)) {
        throw new Error(choiceAnalysisRequiredMessage(locale));
      }
      return {
        type: "finish",
        source: "model",
        text: (finishInput as { summary: string }).summary,
        usage: agentUsageFromModelUsage(result.totalUsage)
      };
    }
    const extraToolCalls = result.toolCalls.slice(1);
    const tool = remoteToolRequestInputFromToolCall(nextToolCall, locale);
    validateModelToolRequestForRun(tool, run);
    return {
      type: "tool",
      source: "model",
      tool,
      diagnostics: extraToolCalls.length
        ? {
            protocolRepairAttempts: 1,
            protocolRepairErrors: [
              isEnglishLocale(locale)
                ? `The model returned ${result.toolCalls.length} tool calls at once. The backend harness queued the first valid tool call and ignored ${extraToolCalls.length} extra call(s) for this step.`
                : `模型一次返回了 ${result.toolCalls.length} 个工具调用。后端 harness 已排队第一个合法工具调用，并忽略本步其余 ${extraToolCalls.length} 个调用。`
            ]
          }
        : undefined
    };
  }
  if (!result.text.trim()) {
    throw new Error(isEnglishLocale(locale) ? "The model returned neither a tool call nor displayable text." : "模型没有返回工具调用，也没有返回可展示的文本。");
  }
  if (agentRunRequiresChoiceAnalysis(run)) {
    throw new Error(choiceAnalysisRequiredMessage(locale));
  }
  return {
    type: "finish",
    source: "model",
    text: result.text,
    usage: agentUsageFromModelUsage(result.totalUsage)
  };
}

function validateModelToolRequestForRun(
  tool: AgentRunRemoteToolRequestInput,
  run: Pick<AgentRunLedgerRecord, "locale" | "prompt">
) {
  if (tool.toolName !== "showChoiceAnalysis" || !isChoiceAnalysisPrompt(run.prompt)) return;
  const args = tool.args as {
    baseConditions?: unknown;
    displayMode?: unknown;
    choices?: unknown;
  };
  if (args.displayMode === "text_only") {
    throw new Error(choiceAnalysisVisualizationRequiredMessage(run.locale, "displayMode must not be text_only for a visual choice problem."));
  }
  if (!Array.isArray(args.baseConditions) || !args.baseConditions.some((item) => typeof item === "string" && item.trim())) {
    throw new Error(choiceAnalysisVisualizationRequiredMessage(run.locale, "baseConditions must describe the shared base canvas."));
  }
  if (!Array.isArray(args.choices) || args.choices.length < 2) {
    throw new Error(choiceAnalysisVisualizationRequiredMessage(run.locale, "choices must include one item per option."));
  }
  const missingVisualEvidence = args.choices.find((choice) => {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) return true;
    const record = choice as Record<string, unknown>;
    const focus = typeof record.constructionFocus === "string" ? record.constructionFocus.trim() : "";
    const commands = Array.isArray(record.commands)
      ? record.commands.filter((command) => typeof command === "string" && command.trim())
      : [];
    return !focus || commands.length === 0;
  });
  if (missingVisualEvidence) {
    throw new Error(choiceAnalysisVisualizationRequiredMessage(run.locale, "each choice must include constructionFocus and non-empty choice-specific commands."));
  }
}

function choiceAnalysisVisualizationRequiredMessage(locale: AgentRunLedgerRecord["locale"], reason: string) {
  return isEnglishLocale(locale)
    ? `showChoiceAnalysis must include option-specific visual scenarios: ${reason}`
    : `showChoiceAnalysis 必须包含选项专属可视化场景：${reason}`;
}

export function choiceAnalysisRequiredMessage(locale?: AgentRunLedgerRecord["locale"]) {
  return isEnglishLocale(locale)
    ? "Choice or multiple-choice prompts must call showChoiceAnalysis before final text; final text cannot replace the choice scenario analysis card."
    : "选择题或多选题必须先调用 showChoiceAnalysis；最终文本不能替代选项场景分析卡片。";
}

export function remoteToolRequestInputFromToolCall(toolCall: ToolCallLike, locale?: AgentRunLedgerRecord["locale"]): AgentRunRemoteToolRequestInput {
  if (!isAgentRunToolCallId(toolCall.toolCallId)) {
    throw new Error(isEnglishLocale(locale) ? "The model returned an invalid tool call ID." : "模型返回了非法工具调用 ID。");
  }
  if (!isFunctionCallToolName(toolCall.toolName)) {
    throw new Error(isEnglishLocale(locale) ? `The model returned an unknown tool: ${toolCall.toolName}` : `模型返回了未知工具：${toolCall.toolName}`);
  }
  const input = normalizeModelToolInput(toolCall.toolName, toolCall.input);
  if (!isFunctionCallArgs(toolCall.toolName, input)) {
    throw new Error(isEnglishLocale(locale) ? `The model returned invalid tool arguments: ${toolCall.toolName}` : `模型返回了非法工具参数：${toolCall.toolName}`);
  }
  const request = {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    args: input
  };
  if (!isAgentRunRemoteToolRequestInput(request)) {
    throw new Error(isEnglishLocale(locale) ? "The model tool call could not be converted into a valid remote tool request." : "模型返回的工具调用无法转换为合法远程工具请求。");
  }
  return request;
}

function normalizeModelToolInput(toolName: FunctionCallToolName, input: unknown) {
  if (toolName === "showChoiceAnalysis") return normalizeChoiceAnalysisInput(input);
  if (toolName !== "showSolutionSteps") return input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  const content = stringValue(record.content) ?? stringValue(record.text) ?? stringValue(record.body);
  const summary = stringValue(record.summary) ?? content ?? null;
  const answer = stringValue(record.answer) ?? summary ?? content ?? stringValue(record.title) ?? "";
  const rawSteps = Array.isArray(record.steps) ? record.steps : content ? [content] : [];
  const steps = rawSteps
    .map((step, index) => normalizeSolutionStep(step, index))
    .filter((step): step is { label: string; body: string } => Boolean(step));
  return {
    title: stringValue(record.title) ?? "解题步骤",
    answer,
    ...(summary ? { summary } : {}),
    ...(stringValue(record.auxiliaryElementReview) ? { auxiliaryElementReview: stringValue(record.auxiliaryElementReview) } : {}),
    steps: steps.length ? steps : [{ label: "说明", body: answer || "已完成整理。" }],
    ...auditFields(record)
  };
}

function normalizeChoiceAnalysisInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = input as Record<string, unknown>;
  const rawChoices = arrayValue(record.choices) ?? arrayValue(record.options) ?? arrayValue(record.items) ?? [];
  const choices = rawChoices
    .map((choice, index) => normalizeChoiceAnalysisChoice(choice, index))
    .filter((choice): choice is NonNullable<ReturnType<typeof normalizeChoiceAnalysisChoice>> => Boolean(choice));
  return {
    title: stringValue(record.title) ?? "选项分析",
    summary: stringValue(record.summary) ?? stringValue(record.content) ?? "按题干公共条件分别判断各选项。",
    ...(stringValue(record.answer) ? { answer: stringValue(record.answer) } : {}),
    ...(stringArrayValue(record.baseConditions) ?? stringArrayValue(record.conditions) ?? stringArrayValue(record.givens)
      ? { baseConditions: stringArrayValue(record.baseConditions) ?? stringArrayValue(record.conditions) ?? stringArrayValue(record.givens) }
      : {}),
    ...(normalizeChoiceDisplayMode(record.displayMode) ? { displayMode: normalizeChoiceDisplayMode(record.displayMode) } : {}),
    ...(stringValue(record.auxiliaryElementReview) ? { auxiliaryElementReview: stringValue(record.auxiliaryElementReview) } : {}),
    choices,
    ...auditFields(record)
  };
}

function normalizeChoiceAnalysisChoice(choice: unknown, index: number) {
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
    const statement = stringValue(choice);
    return statement
      ? {
          label: choiceLabelForIndex(index),
          statement,
          verdict: "unknown" as const,
          explanation: statement
        }
      : undefined;
  }
  const record = choice as Record<string, unknown>;
  const statement =
    stringValue(record.statement) ??
    stringValue(record.text) ??
    stringValue(record.content) ??
    stringValue(record.claim) ??
    stringValue(record.title);
  const explanation =
    stringValue(record.explanation) ??
    stringValue(record.reason) ??
    stringValue(record.analysis) ??
    stringValue(record.body) ??
    statement;
  if (!statement || !explanation) return undefined;
  return {
    label: normalizeChoiceLabel(record.label ?? record.choice ?? record.option) ?? choiceLabelForIndex(index),
    statement,
    verdict: normalizeChoiceVerdict(record.verdict ?? record.status ?? record.judgment ?? record.result ?? record.correct),
    explanation,
    ...(stringValue(record.constructionFocus) ?? stringValue(record.focus) ? { constructionFocus: stringValue(record.constructionFocus) ?? stringValue(record.focus) } : {}),
    ...(stringArrayValue(record.evidence) ? { evidence: stringArrayValue(record.evidence) } : {}),
    ...(stringArrayValue(record.commands) ? { commands: stringArrayValue(record.commands) } : {})
  };
}

function choiceLabelForIndex(index: number): "A" | "B" | "C" | "D" {
  return (["A", "B", "C", "D"][index] ?? "D") as "A" | "B" | "C" | "D";
}

function normalizeChoiceLabel(value: unknown): "A" | "B" | "C" | "D" | undefined {
  const text = stringValue(value)?.trim().replace(/[.．、:：]/g, "").toUpperCase();
  if (text === "A" || text === "B" || text === "C" || text === "D") return text;
  return undefined;
}

function normalizeChoiceVerdict(value: unknown): "true" | "false" | "unknown" {
  if (value === true) return "true";
  if (value === false) return "false";
  const text = stringValue(value)?.trim().toLowerCase();
  if (!text) return "unknown";
  if (["true", "correct", "right", "yes", "valid", "成立", "正确", "对", "是"].includes(text)) return "true";
  if (["false", "incorrect", "wrong", "no", "invalid", "不成立", "错误", "错", "否"].includes(text)) return "false";
  return "unknown";
}

function normalizeChoiceDisplayMode(value: unknown): "single_active_choice" | "compare_choices" | "text_only" | undefined {
  const text = stringValue(value);
  if (text === "single_active_choice" || text === "compare_choices" || text === "text_only") return text;
  return undefined;
}

function normalizeSolutionStep(step: unknown, index: number) {
  if (typeof step === "string") return { label: `步骤 ${index + 1}`, body: step };
  if (!step || typeof step !== "object" || Array.isArray(step)) return undefined;
  const record = step as Record<string, unknown>;
  const body = stringValue(record.body) ?? stringValue(record.content) ?? stringValue(record.text) ?? stringValue(record.description);
  if (!body) return undefined;
  return {
    label: stringValue(record.label) ?? stringValue(record.title) ?? `步骤 ${index + 1}`,
    body
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length ? items : undefined;
}

function auditFields(record: Record<string, unknown>) {
  return {
    ...(stringValue(record.reason) ? { reason: stringValue(record.reason) } : {}),
    ...(stringValue(record.intendedOutcome) ? { intendedOutcome: stringValue(record.intendedOutcome) } : {}),
    ...(stringValue(record.nextExpectedAction) ? { nextExpectedAction: stringValue(record.nextExpectedAction) } : {})
  };
}

function agentUsageFromModelUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): AgentRunUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens
  };
}

function isEnglishLocale(locale: AgentRunLedgerRecord["locale"] | undefined) {
  return locale === "en-US";
}
