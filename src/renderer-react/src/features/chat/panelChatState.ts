
/** Instance-local mutable values consumed by asynchronous agent callbacks. */
export class PanelChatState {
  // No hosted default: the model is whatever the user configured.
  #model: string = "";
  #conversationId: string | null = null;
  #thinkingEnabled = false;

  get model() {
    return this.#model;
  }

  get conversationId() {
    return this.#conversationId;
  }

  get thinkingEnabled() {
    return this.#thinkingEnabled;
  }

  setModel(model: string) {
    this.#model = model;
  }

  setConversationId(conversationId: string | null) {
    this.#conversationId = conversationId;
  }

  setThinkingEnabled(enabled: boolean) {
    this.#thinkingEnabled = enabled;
  }
}
