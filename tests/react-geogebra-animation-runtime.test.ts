import { describe, expect, test } from "bun:test";
import { GeoGebraAnimationRuntime, type AnimationScheduler } from "../src/renderer-react/src/geogebra/animation-runtime";

class FakeScheduler implements AnimationScheduler {
  time = 0;
  nextHandle = 1;
  frames = new Map<number, (time: number) => void>();
  now() { return this.time; }
  requestFrame(callback: (time: number) => void) { const handle = this.nextHandle++; this.frames.set(handle, callback); return handle; }
  cancelFrame(handle: number) { this.frames.delete(handle); }
  advance(ms: number) {
    this.time += ms;
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    for (const callback of callbacks) callback(this.time);
  }
}

describe("GeoGebra business animation runtime", () => {
  test("runs a one-shot animation by elapsed frame time and stops at the target", () => {
    const scheduler = new FakeScheduler();
    const writes: number[] = [];
    const runtime = new GeoGebraAnimationRuntime((_object, value) => writes.push(value), scheduler);
    runtime.configure({ object: "t", from: 0, to: 10, durationMs: 10_000, mode: "once", easing: "linear" }, true);
    scheduler.advance(5_000);
    expect(writes.at(-1)).toBe(5);
    scheduler.advance(5_000);
    expect(writes.at(-1)).toBe(10);
    expect(runtime.snapshot("t")?.status).toBe("completed");
    expect(scheduler.frames.size).toBe(0);
  });

  test("supports loop and ping-pong without depending on slider step size", () => {
    const scheduler = new FakeScheduler();
    const values = new Map<string, number>();
    const runtime = new GeoGebraAnimationRuntime((object, value) => values.set(object, value), scheduler);
    runtime.configure({ object: "loop", from: 0, to: 8, durationMs: 4_000, mode: "loop", easing: "linear" }, true);
    runtime.configure({ object: "wave", from: -1, to: 1, durationMs: 4_000, mode: "ping_pong", easing: "linear" }, true);
    scheduler.advance(5_000);
    expect(values.get("loop")).toBe(2);
    expect(values.get("wave")).toBe(0.5);
    expect(runtime.snapshot("loop")?.status).toBe("running");
    expect(runtime.snapshot("wave")?.status).toBe("running");
  });

  test("keeps a continuous timeline monotonic beyond its reference end value", () => {
    const scheduler = new FakeScheduler();
    const writes: number[] = [];
    const runtime = new GeoGebraAnimationRuntime((_object, value) => writes.push(value), scheduler);
    const configured = runtime.configure({
      object: "time",
      from: 0,
      to: 2 * Math.PI,
      durationMs: 4_000,
      mode: "continuous",
      easing: "ease_in_out"
    }, true);

    expect(configured.easing).toBe("linear");
    scheduler.advance(4_000);
    expect(writes.at(-1)).toBeCloseTo(2 * Math.PI);
    scheduler.advance(2_000);
    expect(writes.at(-1)).toBeCloseTo(3 * Math.PI);
    scheduler.advance(4_000);
    expect(writes.at(-1)).toBeCloseTo(5 * Math.PI);
    expect(runtime.snapshot("time")).toMatchObject({ status: "running", elapsedMs: 10_000 });
  });

  test("pauses and resumes a continuous timeline without losing accumulated time", () => {
    const scheduler = new FakeScheduler();
    let value = 0;
    const runtime = new GeoGebraAnimationRuntime((_object, next) => { value = next; }, scheduler);
    runtime.configure({ object: "clock", from: 10, to: 12, durationMs: 2_000, mode: "continuous", easing: "linear" }, true);

    scheduler.advance(5_000);
    expect(value).toBe(15);
    runtime.control("pause", ["clock"]);
    scheduler.advance(3_000);
    expect(value).toBe(15);
    runtime.control("play", ["clock"]);
    scheduler.advance(2_000);
    expect(value).toBe(17);
    runtime.control("reset", ["clock"]);
    expect(value).toBe(10);
  });

  test("pause, resume, and reset preserve deterministic progress", () => {
    const scheduler = new FakeScheduler();
    let value = -1;
    const runtime = new GeoGebraAnimationRuntime((_object, next) => { value = next; }, scheduler);
    runtime.configure({ object: "a", from: 0, to: 1, durationMs: 10_000, mode: "once", easing: "linear" }, true);
    scheduler.advance(2_500);
    runtime.control("pause", ["a"]);
    scheduler.advance(5_000);
    expect(value).toBe(0.25);
    runtime.control("play", ["a"]);
    scheduler.advance(2_500);
    expect(value).toBe(0.5);
    runtime.control("reset", ["a"]);
    expect(value).toBe(0);
    expect(runtime.snapshot("a")?.status).toBe("configured");
  });

  test("does not retain a half-configured animation when the initial applet write fails", () => {
    const runtime = new GeoGebraAnimationRuntime(() => { throw new Error("setValue failed"); }, new FakeScheduler());
    expect(() => runtime.configure({ object: "a", from: 0, to: 1, durationMs: 10_000, mode: "once", easing: "linear" }))
      .toThrow("setValue failed");
    expect(runtime.snapshot("a")).toBeUndefined();
  });
});
