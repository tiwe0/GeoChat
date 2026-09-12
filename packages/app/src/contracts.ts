/**
 * Cross-boundary contracts: the shapes the renderer, the backend and the
 * desktop shell all have to agree on.
 *
 * A barrel over existing modules, not a new home for code. It exists so the
 * renderer can import from `@geochat-ai/app/contracts` — the grouping the
 * React renderer was written against.
 *
 * Deliberately absent: the hosted model catalog (PLATFORM_MODEL_CATALOG,
 * DEFAULT_AI_MODEL_ID, AiModelId).
 * This build brings its own provider keys, so `model-registry` is the source
 * of truth for what can be selected.
 */
export type {
  AgentRunImageAttachment
} from "./attachments";
export {
  isAgentRunImageAttachment,
  isOptionalAgentRunImageAttachments,
  MAX_AGENT_ATTACHMENT_BYTES,
  MAX_AGENT_ATTACHMENT_COUNT,
  MAX_AGENT_ATTACHMENTS_TOTAL_BYTES
} from "./attachments";
export type { ChatMessageMetadata, ChatTokenUsage } from "./chat";
export type { AgentModelCapability, AgentModelDefinition } from "./model-registry";
export type { AgentRunThinkingEffort } from "./run-ledger";
export { AGENT_RUN_THINKING_EFFORTS, normalizeAgentRunThinkingEffort } from "./run-ledger";
export {
  AGENT_RUNNER_CLAIM_OWNER_CHANNELS,
  createAgentRunRunnerClaimOwner,
  parseAgentRunRunnerClaimOwner,
  type AgentRunRunnerClaimOwner,
  type AgentRunRunnerClaimOwnerChannel
} from "./agent-run-runner-claim";
