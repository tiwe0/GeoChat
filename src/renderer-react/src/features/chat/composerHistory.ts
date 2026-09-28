export type ComposerHistoryDirection = "older" | "newer";

export type ComposerHistoryState = {
  cursor: number | null;
  draft: string;
};

export const EMPTY_COMPOSER_HISTORY_STATE: ComposerHistoryState = {
  cursor: null,
  draft: "",
};

type ComposerHistoryMessage = {
  role: string;
  parts: readonly { type: string; text?: string }[];
};

export function composerHistoryFromMessages(messages: readonly ComposerHistoryMessage[]) {
  return messages.flatMap((message) => {
    if (message.role !== "user") return [];
    const text = message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text!.trim())
      .filter(Boolean)
      .join("\n\n");
    return text ? [text] : [];
  });
}

export function canNavigateComposerHistory(input: {
  value: string;
  direction: ComposerHistoryDirection;
  selectionStart: number | null;
  selectionEnd: number | null;
}) {
  if (input.selectionStart === null || input.selectionEnd === null) return false;
  if (input.selectionStart !== input.selectionEnd) return false;
  if (input.direction === "older") {
    return !input.value.slice(0, input.selectionStart).includes("\n");
  }
  return !input.value.slice(input.selectionEnd).includes("\n");
}

export function navigateComposerHistory(input: {
  entries: readonly string[];
  value: string;
  state: ComposerHistoryState;
  direction: ComposerHistoryDirection;
}): { value: string; state: ComposerHistoryState } | null {
  if (input.entries.length === 0) return null;

  if (input.direction === "older") {
    const cursor = input.state.cursor === null
      ? input.entries.length - 1
      : Math.max(0, input.state.cursor - 1);
    return {
      value: input.entries[cursor]!,
      state: {
        cursor,
        draft: input.state.cursor === null ? input.value : input.state.draft,
      },
    };
  }

  if (input.state.cursor === null) return null;
  if (input.state.cursor < input.entries.length - 1) {
    const cursor = input.state.cursor + 1;
    return {
      value: input.entries[cursor]!,
      state: { ...input.state, cursor },
    };
  }
  return {
    value: input.state.draft,
    state: EMPTY_COMPOSER_HISTORY_STATE,
  };
}
