import { describe, expect, test } from "bun:test";
import {
  ASSISTANT_SESSION_TRANSITION_TABLE,
  AssistantSessionController,
  AssistantSessionTransitionKind,
} from "../src/renderer-react/src/features/session/assistantSessionController";

function createController(overrides: ConstructorParameters<typeof AssistantSessionController>[0] = {}) {
  let nextThread = 0;
  return new AssistantSessionController({
    model: "model-a",
    threadIdFactory: () => `thread-${++nextThread}`,
    ...overrides,
  });
}

describe("AssistantSessionController", () => {
  test.each([
    [AssistantSessionTransitionKind.Idle, "begin-new-conversation", AssistantSessionTransitionKind.NewConversation],
    [AssistantSessionTransitionKind.Idle, "begin-select-conversation", AssistantSessionTransitionKind.SelectConversation],
    [AssistantSessionTransitionKind.NewConversation, "commit-new-conversation", AssistantSessionTransitionKind.Idle],
    [AssistantSessionTransitionKind.NewConversation, "begin-select-conversation", AssistantSessionTransitionKind.SelectConversation],
    [AssistantSessionTransitionKind.SelectConversation, "commit-select-conversation", AssistantSessionTransitionKind.Idle],
    [AssistantSessionTransitionKind.SelectConversation, "cancel-select-conversation", AssistantSessionTransitionKind.Idle],
    [AssistantSessionTransitionKind.SelectConversation, "delete-pending-selection", AssistantSessionTransitionKind.Idle],
  ] as const)("declares the %s --%s--> %s transition", (current, action, next) => {
    expect(ASSISTANT_SESSION_TRANSITION_TABLE[current][action]).toBe(next);
  });

  test.each([
    [AssistantSessionTransitionKind.Idle, "commit-new-conversation"],
    [AssistantSessionTransitionKind.Idle, "commit-select-conversation"],
    [AssistantSessionTransitionKind.NewConversation, "commit-select-conversation"],
    [AssistantSessionTransitionKind.SelectConversation, "commit-new-conversation"],
  ] as const)("rejects the undeclared %s --%s transition", (current, action) => {
    expect(ASSISTANT_SESSION_TRANSITION_TABLE[current][action]).toBeUndefined();
  });

  test("only the newest A-B-C transition may commit", () => {
    const controller = createController();
    const selectA = controller.beginSelectConversation("conversation-a");
    const newB = controller.beginNewConversation();
    const selectC = controller.beginSelectConversation("conversation-c");

    expect(controller.commitSelectConversation(selectA, { title: "A" })).toBeFalse();
    expect(controller.commitNewConversation(newB)).toBeFalse();
    expect(controller.commitSelectConversation(selectC, { title: "C" })).toBeTrue();
    expect(controller.getSnapshot()).toMatchObject({
      conversationId: "conversation-c",
      threadId: "conversation-c",
      title: "C",
      generation: 3,
      transition: { kind: AssistantSessionTransitionKind.Idle },
    });
  });

  test("a stale selection cannot replace a committed new conversation", () => {
    const controller = createController({
      conversationId: "conversation-old",
      threadId: "conversation-old",
      title: "Old",
    });
    const staleSelection = controller.beginSelectConversation("conversation-stale");
    const reset = controller.beginNewConversation();

    expect(controller.commitNewConversation(reset)).toBeTrue();
    expect(controller.commitSelectConversation(staleSelection, { title: "Stale" })).toBeFalse();
    expect(controller.getSnapshot()).toMatchObject({
      conversationId: null,
      title: null,
      threadId: reset.threadId,
    });
  });

  test("a failed current selection returns to idle without changing the session", () => {
    const controller = createController({
      conversationId: "conversation-current",
      threadId: "conversation-current",
      title: "Current",
    });
    const selection = controller.beginSelectConversation("conversation-failed");

    expect(controller.cancelSelectConversation(selection)).toBeTrue();
    expect(controller.getSnapshot()).toMatchObject({
      conversationId: "conversation-current",
      threadId: "conversation-current",
      title: "Current",
      transition: { kind: AssistantSessionTransitionKind.Idle },
    });
    expect(controller.commitSelectConversation(selection, { title: "Failed" })).toBeFalse();
  });

  test("activateForSubmit establishes a conversation and supersedes pending work", () => {
    const controller = createController();
    const staleSelection = controller.beginSelectConversation("conversation-stale");

    const activated = controller.activateForSubmit({ title: "First prompt" });

    expect(activated).toMatchObject({
      conversationId: "thread-1",
      threadId: "thread-1",
      title: "First prompt",
      transition: { kind: AssistantSessionTransitionKind.Idle },
    });
    expect(controller.commitSelectConversation(staleSelection, { title: "Stale" })).toBeFalse();
  });

  test("activateForSubmit can switch to an explicitly requested conversation", () => {
    const controller = createController({
      conversationId: "conversation-a",
      threadId: "conversation-a",
      title: "A",
    });

    controller.activateForSubmit({ conversationId: "conversation-b", title: "B" });

    expect(controller.getSnapshot()).toMatchObject({
      conversationId: "conversation-b",
      threadId: "conversation-b",
      title: "B",
    });
  });

  test("restore replaces identity and optional run settings atomically", () => {
    const controller = createController({ thinkingEnabled: false });
    const pending = controller.beginNewConversation();

    controller.restore({
      conversationId: "recovered",
      title: "Recovered run",
      model: "model-recovered",
      thinkingEnabled: true,
      thinkingEffort: "extended",
    });

    expect(controller.commitNewConversation(pending)).toBeFalse();
    expect(controller.getSnapshot()).toMatchObject({
      conversationId: "recovered",
      threadId: "recovered",
      title: "Recovered run",
      model: "model-recovered",
      thinkingEnabled: true,
      thinkingEffort: "extended",
      transition: { kind: AssistantSessionTransitionKind.Idle },
    });
  });

  test("deleting the current conversation resets identity but a background delete does not", () => {
    const controller = createController({
      conversationId: "current",
      threadId: "current",
      title: "Current",
    });
    const beforeBackgroundDelete = controller.getSnapshot();

    expect(controller.deleteConversation("background")).toBe("background");
    expect(controller.getSnapshot()).toBe(beforeBackgroundDelete);
    expect(controller.deleteConversation("current")).toBe("current");
    expect(controller.getSnapshot()).toMatchObject({
      conversationId: null,
      title: null,
      threadId: "thread-1",
      transition: { kind: AssistantSessionTransitionKind.Idle },
    });
  });

  test("deleting a pending background selection makes its token stale", () => {
    const controller = createController({
      conversationId: "current",
      threadId: "current",
    });
    const pending = controller.beginSelectConversation("background");

    expect(controller.deleteConversation("background")).toBe("background");
    expect(controller.commitSelectConversation(pending, { title: "Deleted" })).toBeFalse();
    expect(controller.getSnapshot().conversationId).toBe("current");
  });

  test("updates model and thinking settings without changing session identity", () => {
    const controller = createController({
      conversationId: "current",
      threadId: "current",
    });

    controller.setModel("model-b");
    controller.setThinkingEnabled(false);
    controller.setThinkingEffort("light");

    expect(controller.getSnapshot()).toMatchObject({
      conversationId: "current",
      threadId: "current",
      model: "model-b",
      thinkingEnabled: false,
      thinkingEffort: "light",
    });
  });

  test("publishes immutable snapshots and supports unsubscribe", () => {
    const controller = createController();
    const snapshots: ReturnType<typeof controller.getSnapshot>[] = [];
    const unsubscribe = controller.subscribe((snapshot) => snapshots.push(snapshot));

    controller.setModel("model-b");
    const published = snapshots[0]!;
    expect(Object.isFrozen(published)).toBeTrue();
    expect(Object.isFrozen(published.transition)).toBeTrue();
    expect(() => {
      (published as { model: string }).model = "mutated";
    }).toThrow();
    expect(controller.getSnapshot().model).toBe("model-b");

    unsubscribe();
    controller.setModel("model-c");
    expect(snapshots).toHaveLength(1);
  });
});
