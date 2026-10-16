import assert from "node:assert/strict";
import test from "node:test";

import type { RemoteStreamHandle, TypertClientRemote } from "@deepseek-ai/dsh-typert-protocol";

import { apply as applyCanvasClient } from "../client/index.tsx";
import { createNativeCanvasConnection } from "../client/native-connection.ts";
import { NativeCanvasBroker } from "../src/native-broker.ts";
import {
  NATIVE_CANVAS_DESCRIPTOR,
  NATIVE_CANVAS_MAX_RESULT_BYTES,
  NativeCanvasReplyAssembler,
  encodeNativeCanvasReply,
  type NativeCanvasDownlink,
  type NativeCanvasUplink
} from "../src/native-protocol.ts";
import { serveNativeCanvasStream } from "../src/native-remote.ts";

class AsyncQueue<T> implements AsyncIterableIterator<T> {
  private readonly values: T[] = [];
  private readonly readers: Array<(value: IteratorResult<T>) => void> = [];
  private ended = false;
  queuedBytes = 0;
  maxQueuedBytes = 0;

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) {
      this.queuedBytes -= JSON.stringify(value).length;
      return Promise.resolve({ done: false, value });
    }
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => this.readers.push(resolve));
  }

  push(value: T): void {
    if (this.ended) throw new Error("Queue is closed.");
    const reader = this.readers.shift();
    if (reader) reader({ done: false, value });
    else {
      this.values.push(value);
      this.queuedBytes += JSON.stringify(value).length;
      this.maxQueuedBytes = Math.max(this.maxQueuedBytes, this.queuedBytes);
    }
  }

  close(): void {
    if (this.ended) return;
    this.ended = true;
    for (const reader of this.readers.splice(0)) reader({ done: true, value: undefined });
  }

  return(): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ done: true, value: undefined });
  }
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("client mounts its dynamic Remote namespace before injecting the canvas UI", async () => {
  const remote = {
    geochatCanvas: {},
    async $mount() {
      return async () => {};
    }
  };
  let injected: readonly string[] | undefined;
  let slotRemote: unknown;
  const context = {
    remote,
    inject(dependencies: readonly string[], callback: (scope: unknown) => void) {
      injected = dependencies;
      callback(context);
      return {};
    },
    effect(callback: () => unknown) {
      callback();
      return {};
    },
    sidebarRightTabs: {
      register() {
        return () => {};
      }
    },
    sidebarRight: {
      mounted: {
        getSnapshot: () => undefined,
        subscribe: () => () => {}
      },
      openTab() {},
      active: () => undefined,
      isExpanded: () => false
    },
    slots: {
      inject(_name: string, register: () => () => void) {
        return register();
      },
      register(definition: { inject(): { remote: unknown } }) {
        slotRemote = definition.inject().remote;
        return () => {};
      }
    }
  };

  await applyCanvasClient(context as never);

  assert.deepEqual(injected, ["slots", "sidebarRight", "sidebarRightTabs", "remote", "remote.geochatCanvas"]);
  assert.equal(slotRemote, remote);
});

test("canvas and UI control streams share one stable page client identity", async () => {
  const identities: string[] = [];
  const closedHandle = (): RemoteStreamHandle<NativeCanvasDownlink, NativeCanvasUplink> => ({
    async *[Symbol.asyncIterator]() {},
    send() {},
    end() {},
    dispose() {}
  });
  const remote = {
    geochatCanvas: {
      connect(_sessionId: string, clientId: string) {
        identities.push(clientId);
        return closedHandle();
      },
      connectUi(_sessionId: string, clientId: string) {
        identities.push(clientId);
        return closedHandle();
      }
    }
  } as unknown as TypertClientRemote;
  const runtime = { async run() {} };
  const canvas = createNativeCanvasConnection({ remote, sessionId: "session-a", runtime });
  const opener = createNativeCanvasConnection({
    remote,
    sessionId: "session-a",
    runtime,
    channel: "connectUi"
  });

  await Promise.all([canvas.done, opener.done]);
  assert.equal(identities.length, 2);
  assert.match(identities[0] ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(identities[0], identities[1]);
});

test("native descriptor resolves the exact Agent SessionId and carries bidirectional stream codecs", () => {
  assert.equal(NATIVE_CANVAS_DESCRIPTOR.mode, "stream");
  assert.equal(NATIVE_CANVAS_DESCRIPTOR.scope?.context, "agent");
  assert.equal(NATIVE_CANVAS_DESCRIPTOR.parameters[0]?.source, "lookup");
  assert.equal(NATIVE_CANVAS_DESCRIPTOR.parameters[0]?.lookup, "agent");
  assert.deepEqual(NATIVE_CANVAS_DESCRIPTOR.cancellation, { parameter: "signal" });
  const codec = NATIVE_CANVAS_DESCRIPTOR.parameters[0]?.codec;
  assert.equal(codec?.mode, "strict");
  if (codec?.mode === "strict") {
    assert.equal(codec.typeSymbol, "@deepseek-ai/dsh-session/types#SessionId");
  }
  assert.ok(NATIVE_CANVAS_DESCRIPTOR.uplink);
});

test("chunked replies stay below the Remote inbox frame budget and reassemble losslessly", () => {
  const result = { png: "x".repeat(700_000), xml: "界".repeat(80_000) };
  const frames = encodeNativeCanvasReply("generation-1", { id: "request-1", ok: true, result });
  assert.ok(frames.length > 10);
  for (const frame of frames) assert.ok(JSON.stringify(frame).length < 64 * 1024);

  const assembler = new NativeCanvasReplyAssembler();
  let reply;
  for (const frame of frames) reply = assembler.push(frame) ?? reply;
  assert.deepEqual(reply, { id: "request-1", ok: true, result });
  assert.throws(
    () =>
      encodeNativeCanvasReply("generation-1", {
        id: "request-1",
        ok: true,
        result: "x".repeat(NATIVE_CANVAS_MAX_RESULT_BYTES)
      }),
    /exceeds/
  );
});

test("native Remote executes a large canvas result with stop-and-wait uplink backpressure", async () => {
  const broker = new NativeCanvasBroker({ timeoutMs: 2_000 });
  const abort = new AbortController();
  const uplink = new AsyncQueue<NativeCanvasUplink>();
  const host = serveNativeCanvasStream(broker, "session-a", uplink, abort.signal);

  const handle: RemoteStreamHandle<NativeCanvasDownlink, NativeCanvasUplink> = {
    [Symbol.asyncIterator]() {
      return host[Symbol.asyncIterator]();
    },
    send(item) {
      uplink.push(item);
    },
    end() {
      uplink.close();
    },
    dispose() {
      abort.abort();
      uplink.close();
    }
  };
  const remote = {
    geochatCanvas: {
      connect(sessionId: string) {
        assert.equal(sessionId, "session-a");
        return handle;
      }
    }
  } as unknown as TypertClientRemote;
  const expected = { png: "p".repeat(900_000), xml: "x".repeat(250_000) };
  const connection = createNativeCanvasConnection({
    remote,
    sessionId: "session-a",
    runtime: {
      async run(toolName, args) {
        assert.equal(toolName, "getPNGBase64");
        assert.deepEqual(args, { scale: 2 });
        return expected;
      }
    }
  });

  await waitFor(() => broker.status("session-a").ready, "native canvas never became ready");
  const result = await broker.run("session-a", "getPNGBase64", { scale: 2 });
  assert.deepEqual(result, expected);
  assert.ok(uplink.maxQueuedBytes < 64 * 1024, `uplink backlog was ${uplink.maxQueuedBytes} bytes`);

  connection.dispose();
  await connection.done;
  broker.dispose();
});

test("a dispatched abort cancels client work and closes the connection without replay", async () => {
  const broker = new NativeCanvasBroker({ timeoutMs: 2_000 });
  const streamAbort = new AbortController();
  const uplink = new AsyncQueue<NativeCanvasUplink>();
  const host = serveNativeCanvasStream(broker, "session-b", uplink, streamAbort.signal);
  const handle: RemoteStreamHandle<NativeCanvasDownlink, NativeCanvasUplink> = {
    [Symbol.asyncIterator]() {
      return host[Symbol.asyncIterator]();
    },
    send(item) {
      uplink.push(item);
    },
    end() {
      uplink.close();
    },
    dispose() {
      streamAbort.abort();
      uplink.close();
    }
  };
  let calls = 0;
  let clientAborted = false;
  const connection = createNativeCanvasConnection({
    remote: { geochatCanvas: { connect: () => handle } } as unknown as TypertClientRemote,
    sessionId: "session-b",
    runtime: {
      async run(_toolName, _args, signal) {
        calls += 1;
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              clientAborted = true;
              resolve();
            },
            { once: true }
          );
        });
        throw new Error("cancelled");
      }
    }
  });
  await waitFor(() => broker.status("session-b").ready, "native canvas never became ready");
  const requestAbort = new AbortController();
  const result = broker.run("session-b", "resetCanvas", {}, requestAbort.signal);
  await waitFor(() => broker.status("session-b").busy, "native canvas request was not dispatched");
  requestAbort.abort();
  await assert.rejects(result, /state unknown/);
  await connection.done;
  assert.equal(calls, 1);
  assert.equal(clientAborted, true);
  assert.deepEqual(broker.status("session-b"), { connected: false, ready: false, busy: false, queued: 0 });
  const replacement = broker.attach("session-b");
  replacement.close();
  broker.dispose();
});

test("disposing an active connection waits for client work to settle before releasing the session", async () => {
  const broker = new NativeCanvasBroker({ timeoutMs: 2_000 });
  const streamAbort = new AbortController();
  const uplink = new AsyncQueue<NativeCanvasUplink>();
  const host = serveNativeCanvasStream(broker, "session-close", uplink, streamAbort.signal);
  const handle: RemoteStreamHandle<NativeCanvasDownlink, NativeCanvasUplink> = {
    [Symbol.asyncIterator]() {
      return host[Symbol.asyncIterator]();
    },
    send(item) {
      uplink.push(item);
    },
    end() {
      uplink.close();
    },
    dispose() {
      streamAbort.abort();
      uplink.close();
    }
  };
  let clientAborted = false;
  let clientStarted = false;
  const connection = createNativeCanvasConnection({
    remote: { geochatCanvas: { connect: () => handle } } as unknown as TypertClientRemote,
    sessionId: "session-close",
    runtime: {
      async run(_toolName, _args, signal) {
        clientStarted = true;
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              clientAborted = true;
              resolve();
            },
            { once: true }
          );
        });
        throw new Error("disposed");
      }
    }
  });

  await waitFor(() => broker.status("session-close").ready, "native canvas never became ready");
  const result = broker.run("session-close", "resetCanvas", {});
  await waitFor(() => broker.status("session-close").busy, "native canvas request was not dispatched");
  await waitFor(() => clientStarted, "native canvas client work did not start");
  connection.dispose();

  await assert.rejects(result, /state unknown/);
  await connection.done;
  assert.equal(clientAborted, true);
  const replacement = broker.attach("session-close");
  replacement.close();
  broker.dispose();
});

test("an abrupt transport loss with active work keeps the session fail-closed", async () => {
  const broker = new NativeCanvasBroker({ timeoutMs: 2_000 });
  const streamAbort = new AbortController();
  const uplink = new AsyncQueue<NativeCanvasUplink>();
  const host = serveNativeCanvasStream(broker, "session-loss", uplink, streamAbort.signal);
  const handle: RemoteStreamHandle<NativeCanvasDownlink, NativeCanvasUplink> = {
    [Symbol.asyncIterator]() {
      return host[Symbol.asyncIterator]();
    },
    send(item) {
      uplink.push(item);
    },
    end() {
      uplink.close();
    },
    dispose() {
      streamAbort.abort();
      uplink.close();
    }
  };
  const connection = createNativeCanvasConnection({
    remote: { geochatCanvas: { connect: () => handle } } as unknown as TypertClientRemote,
    sessionId: "session-loss",
    runtime: {
      async run(_toolName, _args, signal) {
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        throw new Error("transport lost");
      }
    }
  });

  await waitFor(() => broker.status("session-loss").ready, "native canvas never became ready");
  const result = broker.run("session-loss", "resetCanvas", {});
  await waitFor(() => broker.status("session-loss").busy, "native canvas request was not dispatched");
  streamAbort.abort();
  uplink.close();

  await assert.rejects(result, /state unknown/);
  await connection.done;
  assert.throws(() => broker.attach("session-loss"), /already attached/);
  broker.dispose();
});

test("disposing while a broker cancellation is in flight still releases the settled session", async () => {
  const broker = new NativeCanvasBroker({ timeoutMs: 2_000 });
  const streamAbort = new AbortController();
  const uplink = new AsyncQueue<NativeCanvasUplink>();
  const host = serveNativeCanvasStream(broker, "session-cancel-close", uplink, streamAbort.signal);
  const handle: RemoteStreamHandle<NativeCanvasDownlink, NativeCanvasUplink> = {
    [Symbol.asyncIterator]() {
      return host[Symbol.asyncIterator]();
    },
    send(item) {
      uplink.push(item);
    },
    end() {
      uplink.close();
    },
    dispose() {
      streamAbort.abort();
      uplink.close();
    }
  };
  let clientStarted = false;
  const connection = createNativeCanvasConnection({
    remote: { geochatCanvas: { connect: () => handle } } as unknown as TypertClientRemote,
    sessionId: "session-cancel-close",
    runtime: {
      async run(_toolName, _args, signal) {
        clientStarted = true;
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        throw new Error("cancelled while closing");
      }
    }
  });

  await waitFor(() => connection.hasHandshake, "native canvas never completed its handshake");
  const requestAbort = new AbortController();
  const result = broker.run("session-cancel-close", "resetCanvas", {}, requestAbort.signal);
  await waitFor(() => clientStarted, "native canvas client work did not start");
  requestAbort.abort();
  connection.dispose();

  await assert.rejects(result, /state unknown/);
  await connection.done;
  const replacement = broker.attach("session-cancel-close");
  replacement.close();
  broker.dispose();
});
