import type { AgentRunLedgerRecord } from "@geochat-ai/app/agent-run";
import type { PatchBlackboardArgs } from "@geochat-ai/app/blackboard";
import type { UIMessage } from "ai";
import { AgentRunLedgerConflictError } from "../db/agent-run-repository";
import type { ConversationDataScope } from "../db/conversation-repository";
import type { NativeChatDependencies, NativeChatRunStore } from "./native-chat-ports";
import { nativeMessageText } from "./native-chat-request";

export class NativeRunPersistenceCoordinator {
  #run: AgentRunLedgerRecord;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(
    initialRun: AgentRunLedgerRecord,
    private readonly runs: NativeChatRunStore,
  ) {
    this.#run = initialRun;
  }

  get current() {
    return this.#run;
  }

  async claim(isNew: boolean) {
    this.#run = isNew
      ? await this.runs.createLedger(this.#run)
      : await this.runs.compareAndSwapLedger(this.#run, this.#run.revision);
    return this.#run;
  }

  commit(
    update: (current: AgentRunLedgerRecord) => AgentRunLedgerRecord,
    beforePersist?: (next: AgentRunLedgerRecord) => Promise<void>,
  ) {
    const pending = this.#writeQueue.then(async () => {
      const current = this.#run;
      const next = update(current);
      if (current.status !== "running") {
        if (next.status !== current.status) {
          throw new AgentRunLedgerConflictError(current.runId, `terminal status ${current.status}`);
        }
        return current;
      }
      if (beforePersist) await beforePersist(next);
      this.#run = await this.runs.compareAndSwapLedger(next, current.revision);
      return this.#run;
    });
    this.#writeQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }
}

export async function persistNativeConversationMessages(
  conversations: NativeChatDependencies["conversations"],
  conversationId: string,
  messages: UIMessage[],
  dataScope?: ConversationDataScope,
  usage?: AgentRunLedgerRecord["usage"],
  model?: string,
) {
  if (!dataScope || !conversations) return;
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    // AI SDK may expose an in-progress assistant snapshot before assigning its
    // stable message id. Persisting that transient row makes the conversation
    // unreadable because the restore contract deliberately rejects empty ids.
    if (!message.id.trim()) continue;
    const existing = await conversations.findMessageById(message.id, dataScope);
    const content = nativeMessageText(message) || (message.role === "user" ? "Image attachment" : "Agent process completed");
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    await conversations.upsertConversationMessage({
      conversationId,
      ...(model ? { model } : {}),
      message: {
        id: message.id,
        role: message.role,
        content,
        createdAt,
        payload: {
          id: message.id,
          role: message.role,
          content,
          createdAt,
          parts: message.parts,
          ...(message.role === "assistant" && usage
            ? { usage }
            : message.metadata && typeof message.metadata === "object" && "tokenUsage" in message.metadata
              ? { usage: message.metadata.tokenUsage as Record<string, number | undefined> }
              : {}),
        },
      },
    }, dataScope);
  }
}

export async function seedNativeRunBlackboard(
  blackboard: NativeChatDependencies["blackboard"],
  run: Pick<AgentRunLedgerRecord, "runId" | "conversationId" | "userMessageId" | "prompt" | "locale">,
) {
  if (!run.prompt.trim()) return;
  const patch: PatchBlackboardArgs = {
    ops: [
      {
        op: "upsert",
        key: "original_problem",
        category: "original_problem",
        value: run.prompt,
        confidence: 0.95,
        reason: run.locale === "en-US" ? "Seeded from the user prompt when the native agent started." : "原生 Agent 启动时从用户题目自动写入。",
        sourceMessageId: run.userMessageId ?? null,
        sourceRunId: run.runId,
        sourceToolCallId: "native-chat-blackboard-seed",
      },
      {
        op: "upsert",
        key: "current_goal",
        category: "goal",
        value: run.locale === "en-US" ? `Complete the current user request: ${run.prompt}` : `完成当前用户请求：${run.prompt}`,
        confidence: 0.86,
        reason: run.locale === "en-US" ? "Seeded so follow-up turns can resolve the current task." : "用于后续对话解析当前任务和指代。",
        sourceMessageId: run.userMessageId ?? null,
        sourceRunId: run.runId,
        sourceToolCallId: "native-chat-blackboard-seed",
      },
    ],
    reason: run.locale === "en-US" ? "Create baseline working memory for this native agent run." : "为本轮原生 Agent 建立基础工作记忆。",
  };
  await blackboard.patchEntries(run.conversationId, patch, {
    runId: run.runId,
    toolCallId: "native-chat-blackboard-seed",
  });
}
