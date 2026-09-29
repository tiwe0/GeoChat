import { useCallback, useState, useSyncExternalStore } from "react";
import { AssistantSessionController } from "../session/assistantSessionController";

function createAssistantRuntimeThreadId(conversationId?: string | null) {
  return conversationId ?? `conv_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function useAssistantSessionState() {
  const [controller] = useState(() => new AssistantSessionController({
    threadIdFactory: createAssistantRuntimeThreadId,
  }));
  const subscribe = useCallback(
    (notify: () => void) => controller.subscribe(() => notify()),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { controller, snapshot };
}
