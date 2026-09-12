/** Token accounting surfaced next to an assistant message. */
export type ChatTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/**
 * Per-message metadata. The hosted build also carries a `credits` field; this
 * build has no billing, so usage is reported for transparency only.
 */
export type ChatMessageMetadata = {
  tokenUsage?: ChatTokenUsage;
};
