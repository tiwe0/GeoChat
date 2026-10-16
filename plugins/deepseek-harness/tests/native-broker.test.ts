import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { NativeCanvasBroker, type NativeCanvasCommand, type NativeCanvasLease } from "../src/native-broker.ts";

async function nextCommand(lease: NativeCanvasLease): Promise<NativeCanvasCommand> {
  const next = await lease.next();
  assert.equal(next.done, false);
  return next.value;
}

test("requires a ready lease and keeps sessions isolated", async () => {
  const broker = new NativeCanvasBroker();
  await assert.rejects(broker.run("missing", "exists", {}), /not connected/i);

  const first = broker.attach("session-a");
  const second = broker.attach("session-b");
  await assert.rejects(broker.run("session-a", "exists", {}), /not ready/i);
  first.setReady();
  second.setReady();

  const firstResult = broker.run("session-a", "exists", { label: "A" });
  const secondResult = broker.run("session-b", "exists", { label: "B" });
  const firstCommand = await nextCommand(first);
  const secondCommand = await nextCommand(second);
  assert.equal(firstCommand.type, "execute");
  assert.equal(secondCommand.type, "execute");
  if (firstCommand.type !== "execute" || secondCommand.type !== "execute") return;
  assert.deepEqual(firstCommand.args, { label: "A" });
  assert.deepEqual(secondCommand.args, { label: "B" });
  assert.equal(first.reply({ id: firstCommand.id, ok: true, result: "a" }), true);
  assert.equal(second.reply({ id: secondCommand.id, ok: true, result: "b" }), true);
  assert.equal(await firstResult, "a");
  assert.equal(await secondResult, "b");
  broker.dispose();
});

test("rejects a duplicate lease until the prior lease closes", () => {
  const broker = new NativeCanvasBroker();
  const first = broker.attach("session-a");
  assert.throws(() => broker.attach("session-a"), /already attached/i);
  first.close();
  const replacement = broker.attach("session-a");
  assert.notEqual(replacement.generation, first.generation);
  replacement.close();
  broker.dispose();
});

test("serializes commands within one session", async () => {
  const broker = new NativeCanvasBroker();
  const lease = broker.attach("session-a");
  lease.setReady();
  const firstResult = broker.run("session-a", "setValue", { value: 1 });
  const secondResult = broker.run("session-a", "setValue", { value: 2 });
  const first = await nextCommand(lease);
  assert.equal(first.type, "execute");
  await delay(15);
  assert.deepEqual(broker.status("session-a"), { connected: true, ready: true, busy: true, queued: 1 });
  if (first.type !== "execute") return;
  lease.reply({ id: first.id, ok: true, result: 1 });
  assert.equal(await firstResult, 1);
  const second = await nextCommand(lease);
  assert.equal(second.type, "execute");
  if (second.type !== "execute") return;
  lease.reply({ id: second.id, ok: true, result: 2 });
  assert.equal(await secondResult, 2);
  broker.dispose();
});

test("ignores unknown and late replies", async () => {
  const broker = new NativeCanvasBroker({ timeoutMs: 1_000 });
  const lease = broker.attach("session-a");
  lease.setReady();
  const result = broker.run("session-a", "exists", {});
  const command = await nextCommand(lease);
  assert.equal(lease.reply({ id: "unknown", ok: true, result: false }), false);
  assert.equal(command.type, "execute");
  if (command.type !== "execute") return;
  assert.equal(lease.reply({ id: command.id, ok: true, result: true }), true);
  assert.equal(await result, true);
  assert.equal(lease.reply({ id: command.id, ok: true, result: false }), false);
  broker.dispose();
});

test("abort before dispatch removes a queued command without poisoning the lease", async () => {
  const broker = new NativeCanvasBroker();
  const lease = broker.attach("session-a");
  lease.setReady();
  const firstResult = broker.run("session-a", "setValue", { value: 1 });
  const first = await nextCommand(lease);
  const abort = new AbortController();
  const secondResult = broker.run("session-a", "setValue", { value: 2 }, abort.signal);
  abort.abort();
  await assert.rejects(secondResult, /before dispatch/i);
  assert.equal(first.type, "execute");
  if (first.type !== "execute") return;
  lease.reply({ id: first.id, ok: true, result: 1 });
  assert.equal(await firstResult, 1);
  assert.deepEqual(broker.status("session-a"), { connected: true, ready: true, busy: false, queued: 0 });
  lease.close();
  broker.dispose();
});

test("abort after dispatch emits cancel and fails the lease closed", async () => {
  const broker = new NativeCanvasBroker();
  const lease = broker.attach("session-a");
  lease.setReady();
  const abort = new AbortController();
  const result = broker.run("session-a", "resetCanvas", {}, abort.signal);
  const execute = await nextCommand(lease);
  assert.equal(execute.type, "execute");
  abort.abort();
  await assert.rejects(result, /state unknown.*inspect/i);
  const cancel = await nextCommand(lease);
  assert.deepEqual(cancel, { type: "cancel", id: execute.id });
  assert.deepEqual(await lease.next(), { done: true, value: undefined });
  assert.equal(broker.status("session-a").connected, false);
  assert.throws(() => broker.attach("session-a"), /already attached/i);
  if (execute.type === "execute") {
    assert.equal(lease.reply({ id: execute.id, ok: true, result: {} }), false);
    assert.equal(lease.acknowledgeCancel("unknown"), false);
    assert.equal(lease.acknowledgeCancel(execute.id), true);
  }
  const replacement = broker.attach("session-a");
  replacement.close();
  broker.dispose();
});

test("deadline after dispatch emits cancel, rejects queued work, and requires reconnect", async () => {
  const broker = new NativeCanvasBroker({ timeoutMs: 25 });
  const lease = broker.attach("session-a");
  lease.setReady();
  const firstResult = broker.run("session-a", "resetCanvas", {});
  const secondResult = broker.run("session-a", "exists", {});
  const execute = await nextCommand(lease);
  await assert.rejects(firstResult, /state unknown.*inspect/i);
  await assert.rejects(secondResult, /connection closed/i);
  assert.deepEqual(await nextCommand(lease), { type: "cancel", id: execute.id });
  await assert.rejects(broker.run("session-a", "exists", {}), /not connected/i);
  lease.close("old stream closed before cancellation settled");
  assert.throws(() => broker.attach("session-a"), /already attached/i);
  lease.closeSettled("old stream closed after client cancellation settled");
  const replacement = broker.attach("session-a");
  replacement.setReady();
  replacement.close();
  broker.dispose();
});

test("disconnect rejects active and queued work and iterator return closes the lease", async () => {
  const broker = new NativeCanvasBroker();
  const lease = broker.attach("session-a");
  lease.setReady();
  const firstResult = broker.run("session-a", "resetCanvas", {});
  const secondResult = broker.run("session-a", "exists", {});
  await nextCommand(lease);
  lease.close("tab closed");
  await assert.rejects(firstResult, /state unknown.*inspect/i);
  await assert.rejects(secondResult, /connection closed/i);
  assert.throws(() => broker.attach("session-a"), /already attached/i);
  assert.deepEqual(broker.status("session-a"), { connected: false, ready: false, busy: false, queued: 0 });

  lease.closeSettled("client runtime stopped after all active work settled");
  const replacement = broker.attach("session-a");
  replacement.setReady();
  await replacement.return?.();
  assert.equal(broker.status("session-a").connected, false);
  broker.dispose();
});

test("dispose rejects every session and prevents future work", async () => {
  const broker = new NativeCanvasBroker();
  const lease = broker.attach("session-a");
  lease.setReady();
  const result = broker.run("session-a", "exists", {});
  await nextCommand(lease);
  broker.dispose();
  await assert.rejects(result, /disposed/i);
  assert.throws(() => broker.attach("session-b"), /disposed/i);
  await assert.rejects(broker.run("session-a", "exists", {}), /disposed/i);
});

test("enforces queue, request, and result bounds without exposing arguments", async () => {
  const broker = new NativeCanvasBroker({ maxQueue: 2, maxRequestBytes: 64, maxResultBytes: 16 });
  const lease = broker.attach("session-a");
  lease.setReady();
  await assert.rejects(broker.run("session-a", "exists", { secret: "x".repeat(100) }), /request exceeds/i);

  const firstResult = broker.run("session-a", "exists", { index: 1 });
  const secondResult = broker.run("session-a", "exists", { index: 2 });
  await assert.rejects(broker.run("session-a", "exists", { index: 3 }), /queue is full/i);
  const first = await nextCommand(lease);
  assert.equal(first.type, "execute");
  if (first.type !== "execute") return;
  assert.equal(lease.reply({ id: first.id, ok: true, result: "x".repeat(100) }), false);
  await assert.rejects(firstResult, /result exceeds/i);
  await assert.rejects(secondResult, /connection closed/i);
  const safeError = await broker
    .run("session-a", "exists", { secret: "should-not-leak" })
    .then(() => "unexpected success")
    .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
  assert.doesNotMatch(safeError, /should-not-leak/);
  broker.dispose();
});
