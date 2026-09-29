import { bindExternalStoreMessage, type ThreadMessage } from "@assistant-ui/react";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveFusionBubbles } from "../src/renderer-react/src/features/fusion-mode/bubbles";
import type { FusionChatMessage } from "../src/renderer-react/src/features/fusion-mode/types";

const labels = {
  thinking: "thinking",
  connecting: "connecting",
  attachment: "attachment",
};

function userMessage(id: string, text: string): ThreadMessage {
  return {
    id,
    role: "user",
    createdAt: new Date(0),
    content: [{ type: "text", text }],
    attachments: [],
    metadata: { custom: {} },
  };
}

function assistantMessage(
  id: string,
  content: Extract<ThreadMessage, { role: "assistant" }>["content"],
  status: Extract<ThreadMessage, { role: "assistant" }>["status"] = { type: "complete", reason: "stop" },
): ThreadMessage {
  return {
    id,
    role: "assistant",
    createdAt: new Date(0),
    content,
    status,
    metadata: {
      custom: {},
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
    },
  };
}

function externalMessage(id: string, role: "user" | "assistant"): FusionChatMessage {
  return { id, role, parts: [] } as FusionChatMessage;
}

describe("fusion assistant-ui runtime projection", () => {
  test("uses runtime message ids and part indices for merged external messages", () => {
    const user = userMessage("runtime-user", "draw");
    const assistant = assistantMessage("runtime-assistant", [
      { type: "text", text: "done" },
      {
        type: "tool-call",
        toolCallId: "display-1",
        toolName: "showSolutionSteps",
        args: {},
        argsText: "{}",
        result: { title: "Solution", steps: [] },
      },
    ]);
    bindExternalStoreMessage(user, externalMessage("source-user", "user"));
    bindExternalStoreMessage(assistant, [
      externalMessage("source-reasoning", "assistant"),
      externalMessage("source-answer", "assistant"),
    ]);

    expect(deriveFusionBubbles({
      runtimeMessages: [user, assistant],
      sourceMessageIds: ["source-user", "source-reasoning", "source-answer"],
      active: false,
      status: "ready",
      labels,
    })).toEqual([
      { id: "runtime-user", role: "user", content: "draw", messageId: "runtime-user" },
      { id: "fusion-response:source-user", role: "assistant", content: "done", messageId: "runtime-assistant" },
      {
        id: "runtime-assistant:display-1",
        role: "display-card",
        content: "",
        messageId: "runtime-assistant",
        partIndex: 1,
      },
    ]);
  });

  test("keeps an unbound optimistic assistant in the active source turn", () => {
    const user = userMessage("runtime-user", "draw");
    const optimisticAssistant = assistantMessage(
      "runtime-optimistic",
      [{ type: "reasoning", text: "working" }],
      { type: "running" },
    );
    bindExternalStoreMessage(user, externalMessage("source-user", "user"));

    expect(deriveFusionBubbles({
      runtimeMessages: [user, optimisticAssistant],
      sourceMessageIds: ["source-user"],
      active: true,
      status: "streaming",
      labels,
    }).at(-1)).toEqual({
      id: "fusion-response:source-user",
      role: "assistant",
      content: "thinking",
      messageId: "runtime-optimistic",
      pending: true,
    });
  });

  test("uses a single fallback status only while no runtime assistant exists", () => {
    const user = userMessage("runtime-user", "draw");
    bindExternalStoreMessage(user, externalMessage("source-user", "user"));

    expect(deriveFusionBubbles({
      runtimeMessages: [user],
      sourceMessageIds: ["source-user"],
      active: true,
      status: "submitted",
      labels,
    }).at(-1)).toEqual({
      id: "fusion-response:source-user",
      role: "status",
      content: "connecting",
      pending: true,
    });
  });

  test("keeps one response shell identity from placeholder through streamed assistant content", () => {
    const user = userMessage("runtime-user", "draw");
    bindExternalStoreMessage(user, externalMessage("source-user", "user"));
    const submitted = deriveFusionBubbles({
      runtimeMessages: [user],
      sourceMessageIds: ["source-user"],
      active: true,
      status: "submitted",
      labels,
    });
    const streaming = deriveFusionBubbles({
      runtimeMessages: [
        user,
        assistantMessage("runtime-assistant", [{ type: "text", text: "drawing" }], { type: "running" }),
      ],
      sourceMessageIds: ["source-user"],
      active: true,
      status: "streaming",
      labels,
    });

    expect(submitted.at(-1)?.id).toBe("fusion-response:source-user");
    expect(streaming.at(-1)).toMatchObject({
      id: "fusion-response:source-user",
      role: "assistant",
      messageId: "runtime-assistant",
    });
  });

  test("renders shared assistant-ui messages by id without local providers or conversion", () => {
    const root = join(import.meta.dir, "../src/renderer-react/src/features/fusion-mode");
    const stack = readFileSync(join(root, "FusionBubbleStack.tsx"), "utf8");
    const surface = readFileSync(join(root, "FusionModeSurface.tsx"), "utf8");

    expect(stack).toContain("<GeoChatMessageById");
    expect(stack).toContain("<GeoChatDisplayToolById");
    expect(stack).not.toContain("MessageProvider");
    expect(stack).not.toContain("fromThreadMessageLike");
    expect(stack).not.toContain("convertToAssistantUiMessage");
    expect(surface).toContain("state.thread.messages");
    expect(surface).toContain("state.thread.isRunning");
  });
});
