import { stepCountIs, type LanguageModel, type ModelMessage } from "ai";
import {
  GEOCHAT_REPAIR_SYSTEM_PROMPT_EN,
  GEOCHAT_REPAIR_SYSTEM_PROMPT,
  GEOCHAT_SYSTEM_PROMPT_EN,
  GEOCHAT_SYSTEM_PROMPT,
  getAgentModelPolicy,
  type AgentModelConfig,
  type AgentRunImageAttachment,
  type AgentRunLedgerRecord,
  type AgentRunModelStepDetails,
  type AgentRunRemoteToolRequestInput,
  type AgentRunUsage,
  type FunctionCallToolName
} from "@geochat-ai/app";
import {
  formatSkillSelectionPacketPrompt,
  selectAgentSkillsForRun,
  type AgentSkillSelectionPacket
} from "./model-runner-skills";
import {
  buildCommandReferencePacketForRun,
  formatCommandReferencePacketPrompt,
  type AgentCommandReferencePacket
} from "./command-searcher";
import {
  backendActionFromModelResult,
  choiceAnalysisRequiredMessage
} from "./model-runner-toolcalls";
import { createBackendPlanningTools } from "./model-runner-planning-tools";
import {
  createRepairUserMessage,
  latestUnresolvedFailedExecute,
  maybeCreateRepairAction,
  modelMessagesFromRun
} from "./model-runner-context";
import {
  createBackendLanguageModel,
  runBackendModelStep
} from "./model-runner-models";

export {
  formatSkillSelectionPacketPrompt,
  skillRuntimePolicyFromPrompt,
  skillSelectorSystemPrompt
} from "./model-runner-skills";
export type {
  AgentCurriculumSelectionItem,
  AgentSkillRuntimePolicy,
  AgentSkillSelectionItem,
  AgentSkillSelectionPacket,
  AgentSkillSelectionStatus
} from "./model-runner-skills";
export { remoteToolRequestInputFromToolCall } from "./model-runner-toolcalls";

const GEOCHAT_MODEL_PROTOCOL_REPAIR_ATTEMPTS = 1;

export type BackendModelActionDiagnostics = AgentRunModelStepDetails;

export type BackendModelNextActionInput = {
  modelConfig: AgentModelConfig;
  run: AgentRunLedgerRecord;
  attachments?: AgentRunImageAttachment[];
  model?: LanguageModel;
  timeoutMs?: number;
  onTextDelta?: (text: string) => void | Promise<void>;
  disabledToolNames?: FunctionCallToolName[];
};

export type BackendModelNextAction =
  | {
      type: "tool";
      source: "model" | "policy";
      tool: AgentRunRemoteToolRequestInput;
      diagnostics?: BackendModelActionDiagnostics;
    }
  | {
      type: "finish";
      source: "model" | "policy";
      text: string;
      usage?: AgentRunUsage;
      diagnostics?: BackendModelActionDiagnostics;
    };

export async function createBackendModelNextAction(input: BackendModelNextActionInput): Promise<BackendModelNextAction> {
  const modelPolicy = getAgentModelPolicy(input.modelConfig);
  if (!modelPolicy.supportsTools) {
    throw new Error(
      isEnglishLocale(input.run.locale)
        ? `The current model is not declared as tool-calling capable: ${input.modelConfig.provider}/${input.modelConfig.model}`
        : `当前模型未声明 tool-calling 能力：${input.modelConfig.provider}/${input.modelConfig.model}`
    );
  }
  if (input.attachments?.length && !modelPolicy.supportsImages) {
    throw new Error(
      isEnglishLocale(input.run.locale)
        ? `The current model is not declared as image-input capable: ${input.modelConfig.provider}/${input.modelConfig.model}`
        : `当前模型未声明图片输入能力：${input.modelConfig.provider}/${input.modelConfig.model}`
    );
  }

  const repairAction = maybeCreateRepairAction(input.run);
  if (repairAction) return repairAction;
  const model = input.model ?? createBackendLanguageModel(input.modelConfig);
  const repairingFailure = latestUnresolvedFailedExecute(input.run);
  const skillSelection = await selectAgentSkillsForRun({
    run: input.run,
    model,
    temperature: modelPolicy.defaultTemperature,
    timeout: input.timeoutMs ?? 120_000,
    disabledToolNames: input.disabledToolNames
  });
  const commandReferencePacket = buildCommandReferencePacketForRun({
    prompt: input.run.prompt,
    locale: input.run.locale,
    skillSelection
  });
  const systemPrompt = await systemPromptForRun(input.run, Boolean(repairingFailure), skillSelection, commandReferencePacket);
  const messages = repairingFailure
    ? [createRepairUserMessage(input.run, repairingFailure, input.attachments ?? [])]
    : modelMessagesFromRun(input.run, input.attachments ?? []);

  const tools = createBackendPlanningTools(input.run.locale, input.disabledToolNames, skillSelection, input.run);
  let protocolError: Error | undefined;
  const protocolRepairErrors: string[] = [];
  for (let attempt = 0; attempt <= GEOCHAT_MODEL_PROTOCOL_REPAIR_ATTEMPTS; attempt += 1) {
    const result = await runBackendModelStep({
      model,
      system: systemPrompt,
      messages: attempt === 0 ? messages : [...messages, createModelProtocolRepairUserMessage(protocolError, input.run.locale)],
      tools,
      toolChoice: "auto",
      stopWhen: stepCountIs(1),
      maxRetries: 1,
      temperature: modelPolicy.defaultTemperature,
      timeout: input.timeoutMs ?? 120_000,
      onTextDelta: input.onTextDelta
    });
    try {
      return withBackendModelActionDiagnostics(
        withRunPromptGeometryPlanSource(backendActionFromModelResult(result, input.run), input.run),
        protocolRepairErrors
      );
    } catch (error) {
      protocolError = error instanceof Error ? error : new Error(protocolErrorMessage(input.run.locale));
      protocolRepairErrors.push(protocolError.message);
      if (attempt >= GEOCHAT_MODEL_PROTOCOL_REPAIR_ATTEMPTS) throw protocolError;
    }
  }
  throw protocolError ?? new Error(protocolErrorMessage(input.run.locale));
}

function isEnglishLocale(locale: AgentRunLedgerRecord["locale"]) {
  return locale === "en-US";
}

async function systemPromptForRun(
  run: AgentRunLedgerRecord,
  repairing: boolean,
  skillSelection: AgentSkillSelectionPacket,
  commandReferencePacket: AgentCommandReferencePacket
) {
  const basePrompt = isEnglishLocale(run.locale)
    ? repairing
      ? GEOCHAT_REPAIR_SYSTEM_PROMPT_EN
      : GEOCHAT_SYSTEM_PROMPT_EN
    : repairing
      ? GEOCHAT_REPAIR_SYSTEM_PROMPT
      : GEOCHAT_SYSTEM_PROMPT;
  return `${basePrompt}\n\n${formatSkillSelectionPacketPrompt(skillSelection, run.locale)}\n\n${formatCommandReferencePacketPrompt(commandReferencePacket, run.locale)}`;
}

function protocolErrorMessage(locale: AgentRunLedgerRecord["locale"]) {
  return isEnglishLocale(locale)
    ? "The model returned an output that did not satisfy the backend harness protocol."
    : "模型返回了不符合 harness 协议的结果。";
}

function withBackendModelActionDiagnostics(action: BackendModelNextAction, protocolRepairErrors: string[]): BackendModelNextAction {
  if (!protocolRepairErrors.length) return action;
  return {
    ...action,
    diagnostics: {
      ...action.diagnostics,
      protocolRepairAttempts: protocolRepairErrors.length,
      protocolRepairErrors
    }
  };
}

function withRunPromptGeometryPlanSource(action: BackendModelNextAction, run: AgentRunLedgerRecord): BackendModelNextAction {
  if (action.type !== "tool" || action.tool.toolName !== "createGeometryPlan") return action;
  const args = action.tool.args;
  if (typeof args !== "object" || args === null || Array.isArray(args) || "sourceText" in args) return action;
  return {
    ...action,
    tool: {
      ...action.tool,
      args: {
        ...args,
        sourceText: run.prompt
      }
    }
  };
}

function createModelProtocolRepairUserMessage(error?: Error, locale?: AgentRunLedgerRecord["locale"]): ModelMessage {
  const message = error?.message ?? "";
  if (message.includes("showChoiceAnalysis")) {
    if (isEnglishLocale(locale)) {
      return {
        role: "user",
        content: [
          "The previous model output did not pass the GeoChat backend harness protocol.",
          `Error: ${message || "Unknown protocol error."}`,
          "",
          "This is a choice or multiple-choice scenario. Return exactly one showChoiceAnalysis tool call now.",
          "Do not return final text. Do not call executeGeoGebraCommands in this repair step.",
          "The showChoiceAnalysis arguments must include shared baseConditions and one choice entry per option.",
          "Do not use displayMode text_only. Every choice must include non-empty constructionFocus and at least one executable choice-specific command. For parameter-based choices, use commands for parameter-domain slices, level curves, special-value/counterexample lines, extrema slices, or verification objects.",
          "",
          "Do not explain this repair instruction. Output only the corrected single tool call."
        ].join("\n")
      };
    }
    return {
      role: "user",
      content: [
        "上一轮模型输出没有通过 GeoChat 后端 harness 协议校验。",
        `错误：${message || "未知协议错误。"}`,
        "",
        "这是选择题/多选题场景。请现在只返回恰好一个 showChoiceAnalysis 工具调用。",
        "不要返回最终文本；本次修复步骤不要调用 executeGeoGebraCommands。",
        "showChoiceAnalysis 参数必须包含公共题干条件 baseConditions，并为每个选项提供 verdict、explanation。",
        "不要使用 displayMode: text_only。每个选项必须包含非空 constructionFocus 和至少一条可执行的选项专属 commands。参数类选项优先用参数域截面、等值线、特殊值/反例线、极值截面或验证对象来支撑判断。",
        "",
        "不要解释这条修复指令；直接输出修正后的单个工具调用。"
      ].join("\n")
    };
  }
  if (isEnglishLocale(locale)) {
    return {
      role: "user",
      content: [
        "The previous model output did not pass the GeoChat backend harness protocol.",
        `Error: ${error?.message ?? "Unknown protocol error."}`,
        "",
        "Choose exactly one valid action:",
        "1. Return exactly one tool call whose tool name, toolCallId, and arguments satisfy the schema; or",
        "2. Return non-empty final text without also returning a tool call.",
        "",
        "Do not explain this repair instruction. Output only the corrected single-step action."
      ].join("\n")
    };
  }
  return {
    role: "user",
    content: [
      "上一轮模型输出没有通过 GeoChat 后端 harness 协议校验。",
      `错误：${error?.message ?? "未知协议错误。"}`,
      "",
      "请只重新选择一个合法动作：",
      "1. 返回恰好一个工具调用，且工具名、toolCallId、参数都必须满足 schema；或",
      "2. 返回非空的最终文本，不要同时返回工具调用。",
      "",
      "不要解释这条修复指令；直接输出修正后的单步动作。"
    ].join("\n")
  };
}
