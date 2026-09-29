import type { AgentRunLedgerRecord, PatchBlackboardArgs, ReadBlackboardArgs } from "@geochat-ai/app";
import type { CredentialResolver } from "../credentials/resolver";
import type { AgentRunRepository } from "../db/agent-run-repository";
import type { BlackboardRepository } from "../db/blackboard-repository";
import type { ConversationRepository } from "../db/conversation-repository";
import type { executeBackendToolRequest } from "./backend-tools";
import type { selectAgentSkillsForRun } from "./skill-selector";

export type NativeChatRunStore = Pick<
  AgentRunRepository,
  "getLedger" | "createLedger" | "compareAndSwapLedger"
>;

export type NativeChatConversationStore = Pick<
  ConversationRepository,
  "findMessageById" | "upsertConversationMessage"
>;

export type NativeChatBlackboardStore = Pick<BlackboardRepository, "listEntries" | "patchEntries">;

export type NativeChatDependencies = {
  credentials?: CredentialResolver;
  runs: NativeChatRunStore;
  conversations?: NativeChatConversationStore;
  blackboard: NativeChatBlackboardStore;
  executeBackendTool?: typeof executeBackendToolRequest;
  selectSkills?: typeof selectAgentSkillsForRun;
  now?: () => Date;
  createId?: () => string;
};

export type NativeToolExecutionContext = {
  runId: string;
  conversationId: string;
  prompt: string;
  locale: "zh-CN" | "en-US";
  readonly toolHistory: AgentRunLedgerRecord["tools"];
  readBlackboard(args: ReadBlackboardArgs): ReturnType<NativeChatBlackboardStore["listEntries"]>;
  patchBlackboard(
    args: PatchBlackboardArgs,
    context: { runId: string; toolCallId: string },
  ): ReturnType<NativeChatBlackboardStore["patchEntries"]>;
};
