import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import {
  canNavigateComposerHistory,
  EMPTY_COMPOSER_HISTORY_STATE,
  navigateComposerHistory,
  type ComposerHistoryState,
} from "../features/chat/composerHistory";

export function useComposerHistory(input: {
  entries: readonly string[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const stateRef = useRef<ComposerHistoryState>(EMPTY_COMPOSER_HISTORY_STATE);
  const historySignature = JSON.stringify(input.entries);

  const reset = useCallback(() => {
    stateRef.current = EMPTY_COMPOSER_HISTORY_STATE;
  }, []);

  useEffect(() => {
    reset();
  }, [historySignature, reset]);

  const changeValue = useCallback((value: string) => {
    reset();
    input.onChange(value);
  }, [input.onChange, reset]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (input.disabled || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const direction = event.key === "ArrowUp" ? "older" : event.key === "ArrowDown" ? "newer" : null;
    if (!direction) return false;
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) return false;
    if (stateRef.current.cursor === null && !canNavigateComposerHistory({
      value: input.value,
      direction,
      selectionStart: target.selectionStart,
      selectionEnd: target.selectionEnd,
    })) return false;
    const next = navigateComposerHistory({
      entries: input.entries,
      value: input.value,
      state: stateRef.current,
      direction,
    });
    if (!next) return false;
    event.preventDefault();
    stateRef.current = next.state;
    input.onChange(next.value);
    globalThis.requestAnimationFrame(() => {
      const cursor = next.value.length;
      target.setSelectionRange(cursor, cursor);
    });
    return true;
  }, [input.disabled, input.entries, input.onChange, input.value]);

  return { changeValue, handleKeyDown, reset };
}
