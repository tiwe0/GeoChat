import { describe, expect, test } from "bun:test";
import { createDefaultDesktopConfig } from "../src/shared/desktop/desktop-config";
import {
  AgentRunSubmissionLease,
  captureNativeRunRequestSnapshot,
  stopActiveNativeRun,
} from "../src/renderer-react/src/hooks/useAgentRunChat";

describe("native agent run lifecycle", () => {
  test("acquires the submission lease synchronously before asynchronous preparation", () => {
    const lease = new AgentRunSubmissionLease();

    const owner = lease.tryAcquire();
    expect(owner).toBeTypeOf("symbol");
    expect(lease.tryAcquire()).toBeNull();

    lease.release(owner!);
    expect(lease.tryAcquire()).toBeTypeOf("symbol");
  });

  test("does not let a stale submission release a newer lease after invalidation", () => {
    const lease = new AgentRunSubmissionLease();
    const staleOwner = lease.tryAcquire();
    expect(staleOwner).toBeTypeOf("symbol");

    lease.invalidate();
    const currentOwner = lease.tryAcquire();
    expect(currentOwner).toBeTypeOf("symbol");

    lease.release(staleOwner!);
    expect(lease.tryAcquire()).toBeNull();
    lease.release(currentOwner!);
    expect(lease.tryAcquire()).toBeTypeOf("symbol");
  });

  test("captures an immutable request snapshot before attachment upload", () => {
    const model = {
      provider: "openai",
      model: "gpt-6-astra",
      credentialRef: "credential-1",
      maxToolSteps: 12,
    };
    const config = createDefaultDesktopConfig("zh-CN");
    config.model = model;
    config.skills.enabled = true;
    let thinking = true;
    let thinkingEffort = "extended" as const;

    const snapshot = captureNativeRunRequestSnapshot({
      getModelConfig: () => model,
      getThinking: () => thinking,
      getThinkingEffort: () => thinkingEffort,
      locale: "zh-CN",
    }, config);

    model.model = "gpt-5.6-luna";
    config.skills.enabled = false;
    thinking = false;
    thinkingEffort = "light";

    expect(snapshot).toMatchObject({
      model: { provider: "openai", model: "gpt-6-astra", credentialRef: "credential-1" },
      locale: "zh-CN",
      thinking: true,
      thinkingEffort: "extended",
      desktopConfig: { skills: { enabled: true } },
    });
  });

  test("propagates chat stop failures without attempting native cancellation", async () => {
    let terminalizeCalls = 0;

    await expect(stopActiveNativeRun(
      { runId: "run-1", conversationId: "conversation-1" },
      async () => { throw new Error("stream stop failed"); },
      async () => { terminalizeCalls += 1; },
    )).rejects.toThrow("stream stop failed");

    expect(terminalizeCalls).toBe(0);
  });

  test("propagates native cancellation failures to the UI lifecycle", async () => {
    await expect(stopActiveNativeRun(
      { runId: "run-1", conversationId: "conversation-1" },
      async () => undefined,
      async () => { throw new Error("native cancel failed"); },
    )).rejects.toThrow("native cancel failed");
  });
});
