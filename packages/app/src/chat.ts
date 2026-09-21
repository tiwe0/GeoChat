/** Token accounting surfaced next to an assistant message. */
export type ChatTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/** Per-message token accounting reported for local usage transparency. */
export type ChatMessageMetadata = {
  tokenUsage?: ChatTokenUsage;
};
