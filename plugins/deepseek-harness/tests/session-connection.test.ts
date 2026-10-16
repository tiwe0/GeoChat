import assert from "node:assert/strict";
import test from "node:test";
import { connectSessionCanvas } from "../client/session-connection.ts";

const missingAgent = () =>
  Object.assign(new Error("Agent not created"), {
    isDSHRemoteError: true,
    code: "gateway/lookup-not-found",
    details: { endpoint: "geochatCanvas/connect", field: "agentId" }
  });

test("draft subscriptions retry before hello but never reconnect after handshake", async () => {
  let attempts = 0;
  let disconnected = 0;
  const delays: number[] = [];
  await connectSessionCanvas({
    signal: new AbortController().signal,
    connect: () => ({
      hasHandshake: ++attempts === 3,
      done: Promise.reject(missingAgent()),
      dispose() {}
    }),
    wait: async (delay) => {
      delays.push(delay);
    },
    onDisconnected: () => {
      disconnected++;
    }
  });
  assert.equal(attempts, 3);
  assert.equal(disconnected, 1);
  assert.deepEqual(delays, [500, 1_000]);
});

test("unmount cancels initial subscription retries without a disconnect alert", async () => {
  const abort = new AbortController();
  let attempts = 0;
  await connectSessionCanvas({
    signal: abort.signal,
    connect: () => {
      attempts++;
      throw missingAgent();
    },
    wait: async () => {
      abort.abort();
    },
    onDisconnected: () => {
      assert.fail("unmount is not a connection error");
    }
  });
  assert.equal(attempts, 1);
});

test("unknown pre-handshake failures and clean closes surface an error without retry", async () => {
  for (const done of [() => Promise.reject(new Error("registration failed")), () => Promise.resolve()]) {
    let disconnected = 0;
    await connectSessionCanvas({
      signal: new AbortController().signal,
      connect: () => ({ hasHandshake: false, done: done(), dispose() {} }),
      wait: async () => {
        assert.fail("fatal failures must not retry");
      },
      onDisconnected: () => {
        disconnected++;
      }
    });
    assert.equal(disconnected, 1);
  }
});

test("lookup-not-found from a different field is fatal", async () => {
  const error = missingAgent();
  error.details.field = "anotherIdentity";
  let disconnected = 0;
  await connectSessionCanvas({
    signal: new AbortController().signal,
    connect: () => {
      throw error;
    },
    wait: async () => {
      assert.fail("unrelated lookup failures must not retry");
    },
    onDisconnected: () => {
      disconnected++;
    }
  });
  assert.equal(disconnected, 1);
});
