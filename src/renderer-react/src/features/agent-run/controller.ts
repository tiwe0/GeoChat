import type {
  AgentRunRemoteToolRequest,
  AgentRunRunnerSnapshot,
  AgentRunToolRecord,
} from "@geochat-ai/app/client";
import { createAgentRunCoordinator } from "@geochat-ai/app/client";
import type { AgentRunImageAttachment } from "@geochat-ai/app/contracts";
type AgentRunCoordinator = ReturnType<typeof createAgentRunCoordinator>;

export type AgentRunDisplayToolPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: "input-available" | "output-available" | "output-error";
  input: unknown;
  output?: unknown;
  errorText?: string;
};

export type AgentRunDisplayPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | AgentRunDisplayToolPart;

export type AgentRunExecutionResult = {
  assistantText: string;
  parts: AgentRunDisplayPart[];
  runner?: AgentRunRunnerSnapshot;
};

export async function executeAgentRunLoop(input: {
  coordinator: AgentRunCoordinator;
  runId: string;
  claimOwner: string;
  signal: AbortSignal;
  attachments?: AgentRunImageAttachment[];
  initialRunner?: AgentRunRunnerSnapshot;
  claimRemoteTools: (coordinator: AgentRunCoordinator, runId: string, claimOwner: string) => Promise<{
    requests: AgentRunRemoteToolRequest[];
    terminalRunner?: AgentRunRunnerSnapshot;
  }>;
  waitForRunnerEvent?: (signal: AbortSignal) => Promise<void>;
  executeRemoteTool: (request: AgentRunRemoteToolRequest) => Promise<AgentRunToolRecord>;
  afterToolResult?: (request: AgentRunRemoteToolRequest) => Promise<void>;
  onUpdate?: (result: AgentRunExecutionResult) => void;
}): Promise<AgentRunExecutionResult> {
  let runner = input.initialRunner;
  let assistantText = "";
  let parts: AgentRunDisplayPart[] = [];
  const update = () => input.onUpdate?.({ assistantText, parts, runner });
  const appendText = (text: string) => {
    if (!text) return;
    assistantText += text;
    const lastPart = parts.at(-1);
    parts = lastPart?.type === "text"
      ? [...parts.slice(0, -1), { ...lastPart, text: lastPart.text + text }]
      : [...parts, { type: "text", text }];
    update();
  };
  if (runner) {
    parts = mergeRunnerToolParts(parts, runner.run.tools);
    for (const request of runner.pendingToolRequests) parts = upsertDisplayToolPart(parts, displayToolPart(request));
    update();
  }
  while (!input.signal.aborted) {
    const claim = await input.claimRemoteTools(input.coordinator, input.runId, input.claimOwner);
    if (claim.terminalRunner) {
      runner = claim.terminalRunner;
      parts = mergeRunnerToolParts(parts, runner.run.tools);
      update();
      if (runner.run.error) throw new Error(runner.run.error);
      break;
    }
    if (!claim.requests.length) {
      runner = await input.coordinator.runnerSnapshot(input.runId);
      if (!runner || runner.run.status !== "running") {
        if (runner?.run.error) throw new Error(runner.run.error);
        break;
      }
      parts = mergeRunnerToolParts(parts, runner.run.tools);
      for (const request of runner.pendingToolRequests) parts = upsertDisplayToolPart(parts, displayToolPart(request));
      update();
      if (input.waitForRunnerEvent) await input.waitForRunnerEvent(input.signal);
      else await delay(120);
      continue;
    }
    let completed = false;
    for (const request of claim.requests) {
      if (input.signal.aborted) break;
      parts = upsertDisplayToolPart(parts, displayToolPart(request));
      update();
      const tool = await input.executeRemoteTool(request);
      parts = upsertDisplayToolPart(parts, displayToolPart(request, tool));
      update();
      let receivedTextDelta = false;
      const result = await input.coordinator.submitToolResultStream(input.runId, request.toolCallId, {
        tool,
        claimOwner: input.claimOwner,
        ...(input.attachments ? { attachments: input.attachments } : {})
      }, {
        onTextDelta: (text) => {
          receivedTextDelta = true;
          appendText(text);
        },
        // This backend streams text only. Tool records still arrive with the
        // runner snapshot below and are merged there, so the transcript ends
        // up correct — it just fills in per response rather than per tool.
        signal: input.signal
      });
      await input.afterToolResult?.(request);
      if (result?.runner) {
        runner = result.runner;
        parts = mergeRunnerToolParts(parts, runner.run.tools);
      }
      if (result?.text && !receivedTextDelta) appendText(result.text);
      update();
      if (result?.runner && result.runner.run.status !== "running") {
        if (result.runner.run.error) throw new Error(result.runner.run.error);
        completed = true;
        break;
      }
    }
    if (completed) break;
  }
  return { assistantText, parts, runner };
}

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function displayToolPart(request: AgentRunRemoteToolRequest, tool?: AgentRunToolRecord): AgentRunDisplayToolPart {
  if (!tool) return { type: `tool-${request.toolName}`, toolCallId: request.toolCallId, state: "input-available", input: request.args };
  return tool.status === "succeeded"
    ? { type: `tool-${request.toolName}`, toolCallId: request.toolCallId, state: "output-available", input: request.args, output: tool.result }
    : { type: `tool-${request.toolName}`, toolCallId: request.toolCallId, state: "output-error", input: request.args, errorText: tool.error ?? "Renderer tool failed." };
}
function upsertDisplayToolPart(parts: AgentRunDisplayPart[], next: AgentRunDisplayToolPart) {
  const index = parts.findIndex((part) => isDisplayToolPart(part) && part.toolCallId === next.toolCallId);
  return index < 0 ? [...parts, next] : parts.map((part, partIndex) => partIndex === index ? next : part);
}
function mergeRunnerToolParts(parts: AgentRunDisplayPart[], tools: readonly AgentRunToolRecord[]) {
  return tools.reduce((next, tool) => upsertDisplayToolPart(next, displayToolPartFromRecord(tool)), parts);
}
function displayToolPartFromRecord(tool: AgentRunToolRecord): AgentRunDisplayToolPart {
  return tool.status === "succeeded"
    ? { type: `tool-${tool.toolName}`, toolCallId: tool.toolCallId, state: "output-available", input: tool.args, output: tool.result }
    : { type: `tool-${tool.toolName}`, toolCallId: tool.toolCallId, state: "output-error", input: tool.args, errorText: tool.error ?? "Tool execution failed." };
}

function isDisplayToolPart(part: AgentRunDisplayPart): part is AgentRunDisplayToolPart {
  return part.type.startsWith("tool-");
}
