import { describe, expect, test } from "bun:test";
import { captureCanvasFrames } from "../src/renderer-react/src/geogebra/canvas-frames";

describe("GeoGebra canvas frame sampling", () => {
  test("captures four frames by default and forwards only image export input", async () => {
    const captureInputs: Array<Record<string, unknown>> = [];
    const waits: number[] = [];
    const times = [1_000, 1_000, 1_510, 2_030, 2_540];

    const result = await captureCanvasFrames(
      { exportScale: 2, transparent: false },
      (input) => {
        captureInputs.push(input);
        return { ok: true, base64: "AAAA", mediaType: "image/png" };
      },
      async (ms) => { waits.push(ms); },
      () => times.shift()!,
    );

    expect(result.sampling).toEqual({ requestedIntervalMs: 500, count: 4 });
    expect(waits).toEqual([500, 500, 500]);
    expect(captureInputs).toEqual(Array.from({ length: 4 }, () => ({ exportScale: 2, transparent: false })));
    expect(result.frames.map(({ index, elapsedMs }) => ({ index, elapsedMs }))).toEqual([
      { index: 0, elapsedMs: 0 },
      { index: 1, elapsedMs: 510 },
      { index: 2, elapsedMs: 1_030 },
      { index: 3, elapsedMs: 1_540 },
    ]);
    expect(result.limitations).toContain("finite samples do not prove smoothness");
  });

  test("reports observed wall-clock timing instead of inventing uniform timestamps", async () => {
    const times = [10_000, 10_012, 10_583, 11_161];
    const result = await captureCanvasFrames(
      { count: 3, intervalMs: 500, dpi: 144 },
      async () => ({ base64: "AAAA" }),
      async () => undefined,
      () => times.shift()!,
    );

    expect(result.frames.map((frame) => frame.elapsedMs)).toEqual([12, 583, 1_161]);
  });

  test("validates count and interval before capturing", async () => {
    let captures = 0;
    const capture = () => {
      captures += 1;
      return { base64: "AAAA" };
    };

    for (const input of [
      { count: 1 },
      { count: 9 },
      { count: 2.5 },
      { intervalMs: 99 },
      { intervalMs: 2_001 },
      { intervalMs: 100.5 },
    ]) {
      await expect(captureCanvasFrames(input, capture, async () => undefined)).rejects.toThrow();
    }
    expect(captures).toBe(0);
  });

  test("rejects failed or malformed captures without returning partial success", async () => {
    let captures = 0;
    await expect(captureCanvasFrames(
      { count: 3, intervalMs: 100 },
      async () => {
        captures += 1;
        if (captures === 2) throw new Error("capture failed");
        return { base64: "AAAA" };
      },
      async () => undefined,
    )).rejects.toThrow("capture failed");
    expect(captures).toBe(2);

    await expect(captureCanvasFrames(
      { count: 2, intervalMs: 100 },
      async () => ({ ok: true }),
      async () => undefined,
    )).rejects.toThrow("non-empty PNG base64");
  });

  test("bounds aggregate base64 output at 12MB", async () => {
    const chunk = "A".repeat(6 * 1024 * 1024 + 1);
    let captures = 0;

    await expect(captureCanvasFrames(
      { count: 2, intervalMs: 100 },
      async () => {
        captures += 1;
        return { base64: chunk };
      },
      async () => undefined,
    )).rejects.toThrow("12MB aggregate base64 limit");
    expect(captures).toBe(2);
  });
});
