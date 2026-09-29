import { describe, expect, test } from "bun:test";
import {
  CanvasRecoveryRequiredError,
  CanvasTransactionCoordinator,
} from "../src/renderer-react/src/geogebra/canvas-transactions";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("canvas transactions", () => {
  test("restores the transaction's complete initial XML when a later batch fails", async () => {
    let xml = "<xml>initial</xml>";
    const coordinator = new CanvasTransactionCoordinator({
      epoch: () => 1,
      capture: () => xml,
      restore: (snapshot) => { xml = snapshot; return true; },
    });

    await expect(coordinator.run({ label: "replay" }, async (transaction) => {
      xml = "<xml>after-first-batch</xml>";
      await transaction.wait(() => Promise.resolve());
      xml = "<xml>after-second-batch</xml>";
      throw new Error("second batch failed");
    })).rejects.toThrow("second batch failed");

    expect(xml).toBe("<xml>initial</xml>");
  });

  test("serializes A/B/C and lets only the newest superseding transaction commit", async () => {
    let xml = "initial";
    let active = 0;
    let maxActive = 0;
    const aGate = deferred<void>();
    const ran: string[] = [];
    const coordinator = new CanvasTransactionCoordinator({
      epoch: () => 1,
      capture: () => xml,
      restore: (snapshot) => { xml = snapshot; return true; },
    });
    const run = (label: string, gate?: Promise<void>) => coordinator.run(
      { label, supersedeKey: "conversation" },
      async (transaction) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        ran.push(label);
        try {
          xml = label;
          if (gate) await transaction.wait(() => gate);
        } finally {
          active -= 1;
        }
      },
    );

    const a = run("A", aGate.promise);
    await Promise.resolve();
    const b = run("B");
    const c = run("C");
    aGate.resolve();

    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    await expect(b).rejects.toMatchObject({ name: "AbortError" });
    await c;
    expect(maxActive).toBe(1);
    expect(ran).toEqual(["A", "C"]);
    expect(xml).toBe("C");
  });

  test("checks cancellation after the final await and rolls back", async () => {
    let xml = "initial";
    let current = true;
    const gate = deferred<void>();
    const coordinator = new CanvasTransactionCoordinator({
      epoch: () => 1,
      capture: () => xml,
      restore: (snapshot) => { xml = snapshot; return true; },
    });

    const run = coordinator.run({ label: "last-await", shouldContinue: () => current }, async (transaction) => {
      xml = "mutated";
      await transaction.wait(() => gate.promise);
    });
    await Promise.resolve();
    current = false;
    gate.resolve();

    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(xml).toBe("initial");
  });

  test("rejects an await that resumes against a different applet epoch", async () => {
    let epoch = 1;
    let xml = "initial";
    const gate = deferred<void>();
    const coordinator = new CanvasTransactionCoordinator({
      epoch: () => epoch,
      capture: () => xml,
      restore: (snapshot) => { xml = snapshot; return true; },
    });

    const run = coordinator.run({ label: "remount" }, async (transaction) => {
      xml = "old-applet-mutated";
      await transaction.wait(() => gate.promise);
    });
    await Promise.resolve();
    epoch = 2;
    xml = "replacement-applet";
    gate.resolve();

    await expect(run).rejects.toBeInstanceOf(CanvasRecoveryRequiredError);
    expect(coordinator.recoveryState).toMatchObject({ frozen: true, label: "remount" });
    await coordinator.retryRecovery();
    expect(coordinator.recoveryState).toBeNull();
    expect(xml).toBe("replacement-applet");
  });

  test("freezes all later mutations when rollback fails until explicit recovery succeeds", async () => {
    let xml = "initial";
    let restoreWorks = false;
    let workCalls = 0;
    const coordinator = new CanvasTransactionCoordinator({
      epoch: () => 1,
      capture: () => xml,
      restore: (snapshot) => {
        if (!restoreWorks) return false;
        xml = snapshot;
        return true;
      },
    });

    await expect(coordinator.run({ label: "broken" }, async () => {
      xml = "mutated";
      throw new Error("write failed");
    })).rejects.toBeInstanceOf(CanvasRecoveryRequiredError);
    expect(coordinator.recoveryState).toMatchObject({ frozen: true, label: "broken" });

    await expect(coordinator.run({ label: "blocked" }, async () => { workCalls += 1; }))
      .rejects.toBeInstanceOf(CanvasRecoveryRequiredError);
    expect(workCalls).toBe(0);

    restoreWorks = true;
    await coordinator.retryRecovery();
    expect(coordinator.recoveryState).toBeNull();
    expect(xml).toBe("initial");
    await coordinator.run({ label: "allowed" }, async () => { workCalls += 1; });
    expect(workCalls).toBe(1);
  });
});
