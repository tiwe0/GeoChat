import assert from "node:assert/strict";
import test from "node:test";

import type { TypertClientRemote } from "@deepseek-ai/dsh-typert-protocol";

import { createCanvasOpenerRuntime, mountCanvasOpener, type CanvasOpenerSidebar } from "../client/canvas-opener.ts";
import type { NativeCanvasConnection, NativeCanvasRuntime } from "../client/native-connection.ts";

function sidebarFixture(initialSession = "session-a") {
  let session: string | undefined = initialSession;
  let activeKind: string | undefined;
  let expanded = false;
  let unavailable = false;
  const listeners = new Set<() => void>();
  const opened: string[] = [];
  const sidebar: CanvasOpenerSidebar = {
    mounted: {
      getSnapshot: () => session,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    },
    openTab(kind) {
      if (unavailable) throw new Error("sidebarRight: no session surface is mounted");
      opened.push(kind);
      activeKind = kind;
      expanded = true;
    },
    active: () => (activeKind ? ({ kind: activeKind } as never) : undefined),
    isExpanded: () => expanded
  };
  return {
    sidebar,
    opened,
    setUnavailable(value: boolean) {
      unavailable = value;
    },
    setSession(value: string | undefined) {
      session = value;
      for (const listener of listeners) listener();
    }
  };
}

test("canvas opener opens the registered canvas kind and confirms it is visible", async () => {
  const fixture = sidebarFixture();
  const runtime = createCanvasOpenerRuntime(fixture.sidebar, "session-a");

  assert.deepEqual(await runtime.run("openCanvas", {}, new AbortController().signal), { opened: true });
  assert.deepEqual(fixture.opened, ["geochat-canvas"]);
});

test("canvas opener retries only the exact not-yet-mounted surface error", async () => {
  const fixture = sidebarFixture();
  fixture.setUnavailable(true);
  let waits = 0;
  const runtime = createCanvasOpenerRuntime(fixture.sidebar, "session-a", {
    wait: async () => {
      waits += 1;
      fixture.setUnavailable(false);
    },
    timeoutMs: 100
  });

  assert.deepEqual(await runtime.run("openCanvas", {}, new AbortController().signal), { opened: true });
  assert.equal(waits, 1);

  fixture.sidebar.openTab = () => {
    throw new Error("sidebarRight: no tab type is registered as geochat-canvas");
  };
  await assert.rejects(runtime.run("openCanvas", {}, new AbortController().signal), /no tab type/);
});

test("canvas opener refuses stale sessions, cancellation, and unknown commands", async () => {
  const fixture = sidebarFixture();
  const runtime = createCanvasOpenerRuntime(fixture.sidebar, "session-a");
  fixture.setSession("session-b");
  await assert.rejects(runtime.run("openCanvas", {}, new AbortController().signal), /no longer on screen/);

  fixture.setSession("session-a");
  const abort = new AbortController();
  abort.abort("cancelled");
  await assert.rejects(runtime.run("openCanvas", {}, abort.signal), /cancelled/);
  await assert.rejects(runtime.run("resetCanvas", {}, new AbortController().signal), /only accepts openCanvas/);
  await assert.rejects(
    runtime.run("openCanvas", { unexpected: true }, new AbortController().signal),
    /does not accept arguments/
  );
});

test("canvas opener control connection follows only the mounted session and disposes cleanly", async () => {
  const fixture = sidebarFixture();
  const sessions: string[] = [];
  const aborted: string[] = [];
  const channels: string[] = [];
  const connect = (options: {
    readonly sessionId: string;
    readonly signal?: AbortSignal;
    readonly channel?: "connect" | "connectUi";
    readonly runtime: NativeCanvasRuntime;
  }): NativeCanvasConnection => {
    sessions.push(options.sessionId);
    channels.push(options.channel ?? "connect");
    let handshake = true;
    const done = new Promise<void>((resolve) => {
      options.signal?.addEventListener(
        "abort",
        () => {
          handshake = false;
          aborted.push(options.sessionId);
          resolve();
        },
        { once: true }
      );
    });
    return {
      done,
      get hasHandshake() {
        return handshake;
      },
      dispose() {}
    };
  };

  const dispose = mountCanvasOpener({
    remote: {} as TypertClientRemote,
    sidebarRight: fixture.sidebar,
    connect: connect as never
  });
  await Promise.resolve();
  fixture.setSession("session-b");
  await Promise.resolve();
  fixture.setSession(undefined);
  await Promise.resolve();
  dispose();

  assert.deepEqual(sessions, ["session-a", "session-b"]);
  assert.deepEqual(channels, ["connectUi", "connectUi"]);
  assert.deepEqual(aborted, ["session-a", "session-b"]);
});

test("canvas opener retries only the exact missing draft-agent Remote failure", async () => {
  const fixture = sidebarFixture();
  let attempts = 0;
  let controller: AbortController | undefined;
  const dispose = mountCanvasOpener({
    remote: {} as TypertClientRemote,
    sidebarRight: fixture.sidebar,
    wait: async () => {},
    connect(options) {
      attempts += 1;
      if (attempts === 1) {
        throw {
          code: "gateway/lookup-not-found",
          isDSHRemoteError: true,
          details: { endpoint: "geochatCanvas/connectUi", field: "agentId" }
        };
      }
      controller = new AbortController();
      const done = new Promise<void>((resolve) =>
        options.signal?.addEventListener("abort", () => resolve(), { once: true })
      );
      return { done, hasHandshake: true, dispose() {} };
    }
  });

  for (let turn = 0; turn < 5 && attempts < 2; turn += 1) await Promise.resolve();
  assert.equal(attempts, 2);
  assert.ok(controller);
  dispose();
});
