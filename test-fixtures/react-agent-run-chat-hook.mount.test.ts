import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { UIMessage } from "ai";
import {
  AgentRunSubmissionError,
  AgentRunSubmissionLease,
  BackendRuntimeListener,
  BackendRuntimeRecoveryGate,
  backendRuntimeUnavailable,
  invalidateNativeRunAfterBackendLoss,
} from "../src/renderer-react/src/features/agent-run/nativeRunLifecycle";

type HookSlot = { kind: "ref"; value: { current: unknown } }
  | { kind: "state"; value: unknown }
  | { kind: "effect"; cleanup?: () => void };

class HookHarness<Result> {
  private cursor = 0;
  private readonly slots: HookSlot[] = [];
  result!: Result;

  readonly react = {
    useCallback: <Callback extends (...args: never[]) => unknown>(callback: Callback) => callback,
    useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => {
      const index = this.cursor++;
      if (this.slots[index]) return;
      const cleanup = effect() ?? undefined;
      this.slots[index] = { kind: "effect", cleanup };
      void dependencies;
    },
    useRef: <Value>(initialValue: Value) => {
      const index = this.cursor++;
      const existing = this.slots[index];
      if (existing?.kind === "ref") return existing.value as { current: Value };
      const value = { current: initialValue };
      this.slots[index] = { kind: "ref", value };
      return value;
    },
    useState: <Value>(initialValue: Value) => {
      const index = this.cursor++;
      const existing = this.slots[index];
      if (!existing) this.slots[index] = { kind: "state", value: initialValue };
      const setValue = (next: Value | ((current: Value) => Value)) => {
        const slot = this.slots[index];
        if (slot?.kind !== "state") throw new Error("State slot was not initialized.");
        slot.value = typeof next === "function"
          ? (next as (current: Value) => Value)(slot.value as Value)
          : next;
      };
      return [(this.slots[index] as Extract<HookSlot, { kind: "state" }>).value as Value, setValue] as const;
    },
  };

  constructor(private readonly renderHook: () => Result) {}

  render() {
    this.cursor = 0;
    this.result = this.renderHook();
    return this.result;
  }

  unmount() {
    for (const slot of this.slots) if (slot.kind === "effect") slot.cleanup?.();
  }
}

type ChatOptions = {
  onToolCall: (input: { toolCall: { toolName: string; toolCallId: string; input: unknown; dynamic?: boolean } }) => Promise<void>;
  onError: (error: Error) => void;
};

function createChat() {
  return {
    messages: [] as UIMessage[],
    status: "ready",
    error: undefined as Error | undefined,
    sendMessage: mock(async (_message?: unknown) => undefined),
    regenerate: mock(async () => undefined),
    stop: mock(async () => undefined),
    clearError: mock(() => undefined),
    setMessages: mock(() => undefined),
    addToolOutput: mock(async (_output: unknown) => undefined),
  };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for mounted hook state.");
}

let harness: HookHarness<unknown> | undefined;
let chat = createChat();
let chatOptions: ChatOptions | undefined;
let recoverCalls = 0;
let activateCalls: Array<{ runId: string; conversationId: string }> = [];
let activateRun = async (
  activeRef: { current: { runId: string; conversationId: string } | null },
  run: { runId: string; conversationId: string },
) => {
  activeRef.current = { runId: run.runId, conversationId: run.conversationId };
};
let terminalizeCalls: Array<{ runId: string; conversationId: string }> = [];
let onTerminalize = () => undefined;
let rendererToolResult: { ok: boolean; error?: string } = { ok: true };
let uploadAttachments = async (attachments: unknown[]) => attachments;
let uploadCorrelationIds: string[] = [];
let desktopApiValue: {
  getRuntimeInfo: () => Promise<{ backendRuntime?: unknown }>;
  onBackendRuntimeState: (handler: (runtime: never) => void) => Promise<() => void>;
} | undefined;

mock.module("react", () => ({
  useCallback: <Callback extends (...args: never[]) => unknown>(callback: Callback, dependencies?: unknown[]) => {
    void dependencies;
    return harness!.react.useCallback(callback);
  },
  useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => harness!.react.useEffect(effect, dependencies),
  useRef: <Value>(initialValue: Value) => harness!.react.useRef(initialValue),
  useState: <Value>(initialValue: Value) => harness!.react.useState(initialValue),
}));
mock.module("@ai-sdk/react", () => ({
  useChat: (options: ChatOptions) => {
    chatOptions = options;
    return chat;
  },
}));
mock.module("../src/renderer-react/src/features/desktop/runtime", () => ({
  desktopApi: () => desktopApiValue,
  desktopRuntime: () => null,
}));
mock.module("../src/renderer-react/src/features/agent-run/nativeRunLifecycle", () => ({
  AgentRunSubmissionError,
  AgentRunSubmissionLease,
  activateNativeRun: async (
    activeRef: { current: { runId: string; conversationId: string } | null },
    run: { runId: string; conversationId: string },
  ) => {
    activateCalls.push(run);
    await activateRun(activeRef, run);
  },
  BackendRuntimeListener,
  BackendRuntimeRecoveryGate,
  backendRuntimeUnavailable,
  invalidateNativeRunAfterBackendLoss,
  recoverInterruptedNativeRun: async (input: { onRestore?: (run: unknown) => void }) => {
    recoverCalls += 1;
    input.onRestore?.({
      conversationId: "conversation-recovered",
      modelProvider: "openai",
      modelId: "gpt-test",
      prompt: "recovered prompt",
      thinking: false,
      thinkingEffort: null,
    });
  },
  stopActiveNativeRun: async (
    active: { runId: string; conversationId: string } | null,
    stopChat: () => Promise<unknown>,
    terminalize: (run: { runId: string; conversationId: string }) => Promise<unknown>,
  ) => {
    await stopChat();
    if (active) await terminalize(active);
  },
  terminalizeInterruptedNativeRun: async (run: { runId: string; conversationId: string }) => {
    onTerminalize();
    terminalizeCalls.push(run);
  },
  unwrapAgentRunSubmissionError: (error: unknown) => error instanceof AgentRunSubmissionError ? error.originalError : error,
  wasAgentRunMessageAccepted: (error: unknown) => error instanceof AgentRunSubmissionError && error.messageAccepted,
}));
mock.module("../src/renderer-react/src/features/agent-run/nativeRunRequest", () => ({
  isRetryableNativeChatError: () => false,
  nativeChatNetworkRetryDelay: () => null,
  nativeChatRequestBody: () => ({}),
  nativeRunHeaders: () => ({}),
  prepareNativeRunSubmission: (message: { text?: string; files?: unknown[] }, input: { getModelConfig?: () => { provider: string; model: string }; getThinking: () => boolean; getThinkingEffort: () => string }) => {
    const text = message.text?.trim();
    if (!text) return null;
    return {
      files: message.files ?? [],
      localAttachments: [],
      prompt: text,
      text,
      snapshot: {
        model: input.getModelConfig?.() ?? { provider: "openai", model: "gpt-test" },
        locale: "zh-CN",
        thinking: input.getThinking(),
        thinkingEffort: input.getThinkingEffort(),
        desktopConfig: {},
      },
    };
  },
  uploadImageAttachments: async (
    _origin: string,
    _token: string | null,
    attachments: unknown[],
    correlationId: string,
  ) => {
    uploadCorrelationIds.push(correlationId);
    return uploadAttachments(attachments);
  },
}));
mock.module("../src/renderer-react/src/features/agent-run/toolWorker", () => ({
  executeRendererTool: async () => rendererToolResult,
}));

const { useAgentRunChat } = await import("../src/renderer-react/src/hooks/useAgentRunChat");

type ChatHook = ReturnType<typeof useAgentRunChat>;

function mountHook(overrides: Partial<Parameters<typeof useAgentRunChat>[0]> = {}) {
  const onRestore = mock((_run: unknown) => undefined);
  const onRendererToolSettled = mock((_toolName: string) => undefined);
  let mounted!: HookHarness<ChatHook>;
  mounted = new HookHarness(() => useAgentRunChat({
    geogebraRuntime: {} as Parameters<typeof useAgentRunChat>[0]["geogebraRuntime"],
    apiOrigin: "http://127.0.0.1:8787",
    getAuthToken: () => null,
    getModel: () => "gpt-test",
    getModelConfig: () => ({ provider: "openai", model: "gpt-test" }),
    locale: "zh-CN",
    getThinking: () => false,
    getThinkingEffort: () => "standard",
    onRestore,
    onRendererToolSettled,
    ...overrides,
  }));
  harness = mounted;
  mounted.render();
  return { mounted, onRestore, onRendererToolSettled };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { window: { geochatDesktop?: unknown } }).window = {};
  chat = createChat();
  chatOptions = undefined;
  recoverCalls = 0;
  activateCalls = [];
  activateRun = async (activeRef, run) => {
    activeRef.current = { runId: run.runId, conversationId: run.conversationId };
  };
  terminalizeCalls = [];
  onTerminalize = () => undefined;
  rendererToolResult = { ok: true };
  uploadAttachments = async (attachments) => attachments;
  uploadCorrelationIds = [];
  desktopApiValue = undefined;
});

afterEach(() => {
  harness?.unmount();
  harness = undefined;
});

describe("useAgentRunChat mounted behavior", () => {
  test("restores an interrupted run once when mounted", async () => {
    const { mounted, onRestore } = mountHook();
    await Promise.resolve();
    mounted.render();

    expect(recoverCalls).toBe(1);
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-recovered",
      prompt: "recovered prompt",
    }));
  });

  test("activates a native run before the first message is sent", async () => {
    const { mounted } = mountHook();

    await mounted.result.sendMessage({ text: "Draw a circle" }, { body: { conversationId: "conversation-1" } });

    expect(activateCalls).toHaveLength(1);
    expect(activateCalls[0]).toMatchObject({ conversationId: "conversation-1" });
    expect(chat.sendMessage).toHaveBeenCalledWith({ text: "Draw a circle" });
  });

  test("uses the future run id to correlate attachment upload before run activation", async () => {
    const { mounted } = mountHook();

    await mounted.result.sendMessage(
      { text: "Upload and draw" },
      { body: { conversationId: "conversation-upload-correlation" } },
    );

    expect(uploadCorrelationIds).toEqual([activateCalls[0]?.runId]);
  });

  test("rejects an upload-pending submission as unaccepted when the backend becomes unreachable", async () => {
    let runtimeHandler: ((runtime: {
      mode: "external";
      state: "unreachable";
      baseUrl: string;
      error: string;
    }) => void) | undefined;
    let finishUpload: (() => void) | undefined;
    uploadAttachments = async (attachments) => {
      await new Promise<void>((resolve) => { finishUpload = resolve; });
      return attachments;
    };
    desktopApiValue = {
      getRuntimeInfo: async () => ({
        backendRuntime: { mode: "external", state: "running", baseUrl: "http://127.0.0.1:8787" },
      }),
      onBackendRuntimeState: async (handler: typeof runtimeHandler) => {
        runtimeHandler = handler;
        return () => { runtimeHandler = undefined; };
      },
    } as typeof desktopApiValue;
    const { mounted } = mountHook();
    expect(runtimeHandler).toBeFunction();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const submission = mounted.result.sendMessage(
      { text: "Upload then send" },
      { body: { conversationId: "conversation-upload" } },
    );
    await waitFor(() => Boolean(finishUpload));
    runtimeHandler?.({
      mode: "external",
      state: "unreachable",
      baseUrl: "http://127.0.0.1:8787",
      error: "backend health check failed",
    });
    finishUpload?.();

    const error = await submission.catch((caughtError) => caughtError);
    expect(error).toBeInstanceOf(AgentRunSubmissionError);
    expect((error as AgentRunSubmissionError).messageAccepted).toBe(false);
    expect(error.message).toBe("backend health check failed");
    expect(activateCalls).toHaveLength(0);
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  test("rejects a stale upload even when the backend recovers before the upload settles", async () => {
    let runtimeHandler: ((runtime: {
      mode: "external";
      state: "running" | "unreachable";
      baseUrl: string;
      error?: string;
    }) => void) | undefined;
    let finishUpload: (() => void) | undefined;
    uploadAttachments = async (attachments) => {
      await new Promise<void>((resolve) => { finishUpload = resolve; });
      return attachments;
    };
    desktopApiValue = {
      getRuntimeInfo: async () => ({
        backendRuntime: { mode: "external", state: "running", baseUrl: "http://127.0.0.1:8787" },
      }),
      onBackendRuntimeState: async (handler: typeof runtimeHandler) => {
        runtimeHandler = handler;
        return () => { runtimeHandler = undefined; };
      },
    } as typeof desktopApiValue;
    const { mounted } = mountHook();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const submission = mounted.result.sendMessage(
      { text: "Upload across recovery" },
      { body: { conversationId: "conversation-upload-recovery" } },
    );
    await waitFor(() => Boolean(finishUpload));
    runtimeHandler?.({
      mode: "external",
      state: "unreachable",
      baseUrl: "http://127.0.0.1:8787",
      error: "backend health check failed",
    });
    runtimeHandler?.({
      mode: "external",
      state: "running",
      baseUrl: "http://127.0.0.1:8787",
    });
    finishUpload?.();

    const error = await submission.catch((caughtError) => caughtError);
    expect(error).toBeInstanceOf(AgentRunSubmissionError);
    expect((error as AgentRunSubmissionError).messageAccepted).toBe(false);
    expect(error.message).toBe("The agent run submission was interrupted by a backend lifecycle change.");
    expect(activateCalls).toHaveLength(0);
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  test("rejects an activation-pending submission as unaccepted when the backend becomes unavailable", async () => {
    let runtimeHandler: ((runtime: {
      mode: "managed";
      state: "running" | "exited";
      baseUrl: string;
      error?: string;
    }) => void) | undefined;
    let finishActivation: (() => void) | undefined;
    activateRun = async (activeRef, run) => {
      activeRef.current = { runId: run.runId, conversationId: run.conversationId };
      await new Promise<void>((resolve) => { finishActivation = resolve; });
    };
    desktopApiValue = {
      getRuntimeInfo: async () => ({
        backendRuntime: { mode: "managed", state: "running", baseUrl: "http://127.0.0.1:8787" },
      }),
      onBackendRuntimeState: async (handler: typeof runtimeHandler) => {
        runtimeHandler = handler;
        return () => { runtimeHandler = undefined; };
      },
    } as typeof desktopApiValue;
    const { mounted } = mountHook();
    await Promise.resolve();

    const submission = mounted.result.sendMessage(
      { text: "Persist then send" },
      { body: { conversationId: "conversation-persist" } },
    );
    await waitFor(() => Boolean(finishActivation));
    expect(finishActivation).toBeFunction();
    runtimeHandler?.({
      mode: "managed",
      state: "exited",
      baseUrl: "http://127.0.0.1:8787",
      error: "backend exited during persistence",
    });
    finishActivation?.();

    const error = await submission.catch((caughtError) => caughtError);
    expect(error).toBeInstanceOf(AgentRunSubmissionError);
    expect((error as AgentRunSubmissionError).messageAccepted).toBe(false);
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  test("a stale submission cannot release the lease or clear a newer active run", async () => {
    type Runtime = {
      mode: "managed";
      state: "running" | "exited";
      baseUrl: string;
      error?: string;
    };
    let runtimeHandler: ((runtime: Runtime) => void) | undefined;
    let finishOldActivation: (() => void) | undefined;
    let finishNewTransport: (() => void) | undefined;
    let activationIndex = 0;
    activateRun = async (activeRef, run) => {
      activeRef.current = { runId: run.runId, conversationId: run.conversationId };
      activationIndex += 1;
      if (activationIndex === 1) {
        await new Promise<void>((resolve) => { finishOldActivation = resolve; });
      }
    };
    chat.sendMessage.mockImplementation(async () => new Promise<void>((resolve) => {
      finishNewTransport = resolve;
    }));
    desktopApiValue = {
      getRuntimeInfo: async () => ({
        backendRuntime: { mode: "managed", state: "running", baseUrl: "http://127.0.0.1:8787" },
      }),
      onBackendRuntimeState: async (handler: (runtime: Runtime) => void) => {
        runtimeHandler = handler;
        return () => { runtimeHandler = undefined; };
      },
    };
    const { mounted } = mountHook();
    await Promise.resolve();

    const oldSubmission = mounted.result.sendMessage(
      { text: "Old submission" },
      { body: { conversationId: "conversation-old" } },
    );
    await waitFor(() => Boolean(finishOldActivation));
    runtimeHandler?.({
      mode: "managed",
      state: "exited",
      baseUrl: "http://127.0.0.1:8787",
      error: "backend exited",
    });
    runtimeHandler?.({ mode: "managed", state: "running", baseUrl: "http://127.0.0.1:8787" });

    const newSubmission = mounted.result.sendMessage(
      { text: "New submission" },
      { body: { conversationId: "conversation-new" } },
    );
    await waitFor(() => activateCalls.length === 2 && Boolean(finishNewTransport));
    expect(activateCalls).toHaveLength(2);
    expect(finishNewTransport).toBeFunction();

    finishOldActivation?.();
    const oldError = await oldSubmission.catch((caughtError) => caughtError);
    expect(oldError).toBeInstanceOf(AgentRunSubmissionError);
    expect((oldError as AgentRunSubmissionError).messageAccepted).toBe(false);

    await mounted.result.sendMessage(
      { text: "Must remain blocked" },
      { body: { conversationId: "conversation-third" } },
    );
    expect(activateCalls).toHaveLength(2);

    finishNewTransport?.();
    await newSubmission;
    await mounted.result.stop();
    expect(terminalizeCalls.map((run) => run.conversationId)).toEqual([
      "conversation-old",
      "conversation-new",
    ]);
  });

  test("re-reads the runtime snapshot after the asynchronous listener becomes ready", async () => {
    let finishRegistration: ((unsubscribe: () => void) => void) | undefined;
    const getRuntimeInfo = mock(async () => ({
      backendRuntime: {
        mode: "managed" as const,
        state: "exited" as const,
        baseUrl: "http://127.0.0.1:8787",
        error: "backend exited during listener registration",
      },
    }));
    desktopApiValue = {
      getRuntimeInfo,
      onBackendRuntimeState: async () => new Promise<() => void>((resolve) => {
        finishRegistration = resolve;
      }),
    } as typeof desktopApiValue;
    const { mounted } = mountHook();

    expect(finishRegistration).toBeFunction();
    finishRegistration?.(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    mounted.render();

    expect(getRuntimeInfo).toHaveBeenCalledTimes(1);
    expect(mounted.result.backendRuntime).toMatchObject({
      state: "exited",
      error: "backend exited during listener registration",
    });
    expect(chat.stop).toHaveBeenCalledTimes(1);
  });

  test("exposes retry after an accepted send fails and regenerates without duplicating the user message", async () => {
    chat.sendMessage.mockImplementationOnce(async () => { throw new Error("transport failed"); });
    const { mounted } = mountHook();

    await expect(mounted.result.sendMessage(
      { text: "Retry me" },
      { body: { conversationId: "conversation-retry" } },
    )).rejects.toBeInstanceOf(AgentRunSubmissionError);
    mounted.render();

    expect(mounted.result.canRetry).toBe(true);
    await expect(mounted.result.retry()).resolves.toBe(true);
    expect(activateCalls).toHaveLength(2);
    expect(chat.clearError).toHaveBeenCalledTimes(1);
    expect(chat.regenerate).toHaveBeenCalledTimes(1);
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
  });

  test("stops the stream before terminalizing the active native run", async () => {
    const order: string[] = [];
    chat.stop.mockImplementation(async () => { order.push("stream"); });
    const { mounted } = mountHook();
    await mounted.result.sendMessage({ text: "Long task" }, { body: { conversationId: "conversation-stop" } });
    const active = activateCalls[0]!;
    onTerminalize = () => { order.push("native"); };

    await mounted.result.stop();

    expect(order).toEqual(["stream", "native"]);
    expect(terminalizeCalls).toEqual([{
      runId: active.runId,
      conversationId: active.conversationId,
    }]);
  });

  test("publishes a renderer tool result and settlement callback for the active run", async () => {
    const { mounted, onRendererToolSettled } = mountHook();
    await mounted.result.sendMessage({ text: "Inspect canvas" }, { body: { conversationId: "conversation-tool" } });

    await chatOptions!.onToolCall({
      toolCall: {
        toolName: "getCanvasContext",
        toolCallId: "tool-1",
        input: {},
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chat.addToolOutput).toHaveBeenCalledWith({
      tool: "getCanvasContext",
      toolCallId: "tool-1",
      output: { ok: true },
    });
    expect(onRendererToolSettled).toHaveBeenCalledWith("getCanvasContext");
  });
});
