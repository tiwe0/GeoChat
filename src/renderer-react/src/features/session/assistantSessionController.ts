export type AssistantThinkingEffort = "light" | "standard" | "extended";

export enum AssistantSessionTransitionKind {
  Idle = "idle",
  NewConversation = "new-conversation",
  SelectConversation = "select-conversation",
}

export type AssistantSessionTransition =
  | Readonly<{ kind: AssistantSessionTransitionKind.Idle }>
  | Readonly<{
      kind: AssistantSessionTransitionKind.NewConversation;
      generation: number;
      threadId: string;
    }>
  | Readonly<{
      kind: AssistantSessionTransitionKind.SelectConversation;
      generation: number;
      conversationId: string;
    }>;

export type AssistantSessionSnapshot = Readonly<{
  conversationId: string | null;
  title: string | null;
  threadId: string;
  model: string;
  thinkingEnabled: boolean;
  thinkingEffort: AssistantThinkingEffort;
  generation: number;
  transition: AssistantSessionTransition;
}>;

export type NewConversationToken = Readonly<{
  kind: AssistantSessionTransitionKind.NewConversation;
  generation: number;
  threadId: string;
}>;

export type SelectConversationToken = Readonly<{
  kind: AssistantSessionTransitionKind.SelectConversation;
  generation: number;
  conversationId: string;
}>;

export type AssistantSessionControllerOptions = Partial<Pick<
  AssistantSessionSnapshot,
  "conversationId" | "title" | "threadId" | "model" | "thinkingEnabled" | "thinkingEffort"
>> & {
  threadIdFactory?: () => string;
};

export type SelectedConversationSession = Readonly<{
  title: string | null;
  threadId?: string;
  model?: string;
  thinkingEnabled?: boolean;
  thinkingEffort?: AssistantThinkingEffort;
}>;

export type RestoredAssistantSession = Readonly<{
  conversationId: string;
  title: string | null;
  threadId?: string;
  model?: string;
  thinkingEnabled?: boolean;
  thinkingEffort?: AssistantThinkingEffort;
}>;

export type SubmitSessionActivation = Readonly<{
  conversationId?: string;
  title?: string | null;
}>;

export type AssistantSessionListener = (snapshot: AssistantSessionSnapshot) => void;

const IDLE_TRANSITION = Object.freeze({
  kind: AssistantSessionTransitionKind.Idle,
}) satisfies AssistantSessionTransition;

function defaultThreadIdFactory() {
  return `conv_${crypto.randomUUID().replaceAll("-", "")}`;
}

function freezeTransition(transition: AssistantSessionTransition): AssistantSessionTransition {
  return Object.freeze({ ...transition });
}

function freezeSnapshot(
  snapshot: Omit<AssistantSessionSnapshot, "transition"> & {
    transition: AssistantSessionTransition;
  },
): AssistantSessionSnapshot {
  return Object.freeze({
    ...snapshot,
    transition: freezeTransition(snapshot.transition),
  });
}

/**
 * Owns the identity and model state of the assistant session.
 *
 * Async UI work starts with a transition token. Only the latest token may
 * commit, which prevents a slower conversation selection or reset from
 * replacing a newer user action.
 */
export class AssistantSessionController {
  readonly #threadIdFactory: () => string;
  readonly #listeners = new Set<AssistantSessionListener>();
  #snapshot: AssistantSessionSnapshot;

  constructor(options: AssistantSessionControllerOptions = {}) {
    this.#threadIdFactory = options.threadIdFactory ?? defaultThreadIdFactory;
    this.#snapshot = freezeSnapshot({
      conversationId: options.conversationId ?? null,
      title: options.title ?? null,
      threadId: options.threadId ?? options.conversationId ?? this.#threadIdFactory(),
      model: options.model ?? "",
      thinkingEnabled: options.thinkingEnabled ?? true,
      thinkingEffort: options.thinkingEffort ?? "standard",
      generation: 0,
      transition: IDLE_TRANSITION,
    });
  }

  getSnapshot(): AssistantSessionSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: AssistantSessionListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  beginNewConversation(): NewConversationToken {
    const token = Object.freeze({
      kind: AssistantSessionTransitionKind.NewConversation,
      generation: this.#snapshot.generation + 1,
      threadId: this.#threadIdFactory(),
    }) satisfies NewConversationToken;
    this.#replace({
      generation: token.generation,
      transition: token,
    });
    return token;
  }

  commitNewConversation(token: NewConversationToken): boolean {
    if (!this.#matchesNewConversation(token)) return false;
    this.#replace({
      conversationId: null,
      title: null,
      threadId: token.threadId,
      transition: IDLE_TRANSITION,
    });
    return true;
  }

  beginSelectConversation(conversationId: string): SelectConversationToken {
    const token = Object.freeze({
      kind: AssistantSessionTransitionKind.SelectConversation,
      generation: this.#snapshot.generation + 1,
      conversationId,
    }) satisfies SelectConversationToken;
    this.#replace({
      generation: token.generation,
      transition: token,
    });
    return token;
  }

  commitSelectConversation(
    token: SelectConversationToken,
    selected: SelectedConversationSession,
  ): boolean {
    if (!this.#matchesSelectConversation(token)) return false;
    this.#replace({
      conversationId: token.conversationId,
      title: selected.title,
      threadId: selected.threadId ?? token.conversationId,
      model: selected.model ?? this.#snapshot.model,
      thinkingEnabled: selected.thinkingEnabled ?? this.#snapshot.thinkingEnabled,
      thinkingEffort: selected.thinkingEffort ?? this.#snapshot.thinkingEffort,
      transition: IDLE_TRANSITION,
    });
    return true;
  }

  restore(restored: RestoredAssistantSession): AssistantSessionSnapshot {
    const generation = this.#snapshot.generation + 1;
    this.#replace({
      conversationId: restored.conversationId,
      title: restored.title,
      threadId: restored.threadId ?? restored.conversationId,
      model: restored.model ?? this.#snapshot.model,
      thinkingEnabled: restored.thinkingEnabled ?? this.#snapshot.thinkingEnabled,
      thinkingEffort: restored.thinkingEffort ?? this.#snapshot.thinkingEffort,
      generation,
      transition: IDLE_TRANSITION,
    });
    return this.#snapshot;
  }

  activateForSubmit(activation: SubmitSessionActivation = {}): AssistantSessionSnapshot {
    const previousConversationId = this.#snapshot.conversationId;
    const conversationId = activation.conversationId
      ?? previousConversationId
      ?? this.#snapshot.threadId;
    const switchedConversation = conversationId !== previousConversationId;
    this.#replace({
      conversationId,
      title: activation.title === undefined
        ? switchedConversation ? null : this.#snapshot.title
        : activation.title,
      threadId: switchedConversation ? conversationId : this.#snapshot.threadId,
      generation: this.#snapshot.generation + 1,
      transition: IDLE_TRANSITION,
    });
    return this.#snapshot;
  }

  deleteConversation(conversationId: string): "current" | "background" {
    if (conversationId === this.#snapshot.conversationId) {
      this.#replace({
        conversationId: null,
        title: null,
        threadId: this.#threadIdFactory(),
        generation: this.#snapshot.generation + 1,
        transition: IDLE_TRANSITION,
      });
      return "current";
    }

    const transition = this.#snapshot.transition;
    if (
      transition.kind === AssistantSessionTransitionKind.SelectConversation
      && transition.conversationId === conversationId
    ) {
      this.#replace({
        generation: this.#snapshot.generation + 1,
        transition: IDLE_TRANSITION,
      });
    }
    return "background";
  }

  setModel(model: string): void {
    this.#replace({ model });
  }

  setThinkingEnabled(thinkingEnabled: boolean): void {
    this.#replace({ thinkingEnabled });
  }

  setThinkingEffort(thinkingEffort: AssistantThinkingEffort): void {
    this.#replace({ thinkingEffort });
  }

  #matchesNewConversation(token: NewConversationToken): boolean {
    const transition = this.#snapshot.transition;
    return transition.kind === AssistantSessionTransitionKind.NewConversation
      && transition.generation === token.generation
      && transition.threadId === token.threadId;
  }

  #matchesSelectConversation(token: SelectConversationToken): boolean {
    const transition = this.#snapshot.transition;
    return transition.kind === AssistantSessionTransitionKind.SelectConversation
      && transition.generation === token.generation
      && transition.conversationId === token.conversationId;
  }

  #replace(patch: Partial<Omit<AssistantSessionSnapshot, "transition">> & {
    transition?: AssistantSessionTransition;
  }): void {
    const next = freezeSnapshot({
      ...this.#snapshot,
      ...patch,
      transition: patch.transition ?? this.#snapshot.transition,
    });
    this.#snapshot = next;
    for (const listener of this.#listeners) listener(next);
  }
}
