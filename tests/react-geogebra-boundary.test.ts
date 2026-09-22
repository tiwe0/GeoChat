import { describe, expect, test } from "bun:test";
import { evaluateCommand, normalizeCommandResult } from "../src/renderer-react/src/geogebra/command-executor";
import { GeoGebraController } from "../src/renderer-react/src/geogebra/controller";
import type { GeoGebraApi } from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

/**
 * The applet boundary, headless.
 *
 * These replace the equivalent coverage of the SolidJS renderer's
 * geogebra-* modules, which were deleted with it. The canvas-context summary
 * is not covered here: this renderer parses XML with DOMParser, which the test
 * runtime does not provide. tryReadCanvasContext swallows that, so the batch
 * path below still exercises correctly, but the XML summary itself is
 * currently only exercised in the browser.
 */
const api = (overrides: Partial<GeoGebraApi>): GeoGebraApi => overrides as GeoGebraApi;

describe("command result normalization", () => {
  test("reads a JSON envelope from the async API", () => {
    const result = normalizeCommandResult(
      "Circle(A,3)",
      { payload: JSON.stringify({ ok: true, labels: ["c"] }), nativeError: null },
      "asyncEvalCommandResult",
      12
    );
    expect(result.success).toBe(true);
    expect(result.label).toBe("c");
    expect(result.error).toBeNull();
    expect(result.resultAvailable).toBe(true);
  });

  test("a JSON envelope reporting failure is a failure even without a native error", () => {
    const result = normalizeCommandResult(
      "Bad(",
      { payload: JSON.stringify({ ok: false, error: "syntax" }), nativeError: null },
      "evalCommandResult",
      3
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("syntax");
  });

  test("a native error beats an envelope claiming success", () => {
    const result = normalizeCommandResult(
      "Circle(A,3)",
      { payload: JSON.stringify({ ok: true, labels: ["c"] }), nativeError: "applet threw" },
      "evalCommand",
      1
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("applet threw");
  });

  test("the boolean API is read as success or failure", () => {
    expect(normalizeCommandResult("A=(1,2)", { payload: true, nativeError: null }, "evalCommand", 1).success).toBe(true);
    expect(normalizeCommandResult("A=(1,2)", { payload: false, nativeError: null }, "evalCommand", 1).success).toBe(false);
  });

  test("no result at all is a failure, and says so", () => {
    const result = normalizeCommandResult("A=(1,2)", { payload: undefined, nativeError: null }, "evalCommand", 1);
    expect(result.success).toBe(false);
    expect(result.resultAvailable).toBe(false);
    expect(result.error).toContain("without returning a result");
  });
});

describe("command evaluation across the available applet APIs", () => {
  test("prefers the async result API when the applet offers it", async () => {
    const called: string[] = [];
    const result = await evaluateCommand(api({
      asyncEvalCommandResult: (command: string) => { called.push("async"); return JSON.stringify({ ok: true, labels: ["A"] }); },
      evalCommandResult: () => { called.push("sync"); return "{}"; },
      evalCommand: () => { called.push("bool"); return true; }
    }), "A=(1,2)");
    expect(called).toEqual(["async"]);
    expect(result.success).toBe(true);
    expect(result.method).toBe("asyncEvalCommandResult");
  });

  test("falls back to the boolean API when nothing richer exists", async () => {
    const result = await evaluateCommand(api({ evalCommand: () => true }), "A=(1,2)");
    expect(result.success).toBe(true);
    expect(result.method).toBe("evalCommand");
  });

  test("an applet with no command API raises a capability error, not a failed command", async () => {
    // Distinct on purpose: a rejected command is the model's problem to fix,
    // an applet without the API is not, and retrying it would never help.
    await expect(evaluateCommand(api({}), "A=(1,2)")).rejects.toThrow(/does not expose a supported command API/);
  });
});

describe("controller tool boundary", () => {
  test("refuses every tool before the applet is mounted", async () => {
    const controller = new GeoGebraController();
    expect(controller.ready).toBe(false);
    await expect(controller.executeTool("getCanvasContext", {})).rejects.toThrow();
  });

  test("clamps PNG export options rather than passing them through", async () => {
    const calls: unknown[][] = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      getPNGBase64: (...args: unknown[]) => { calls.push(args); return "data:image/png;base64,AAAA"; }
    }));
    const result = await controller.executeTool("getPNGBase64", { exportScale: 99, transparent: false, dpi: 5000 }) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.base64).toBe("AAAA");
    expect(result.exportScale).toBe(4);
    expect(result.dpi).toBe(600);
    expect(result.transparent).toBe(false);
    expect(calls[0]?.[0]).toBe(4);
    expect(calls[0]).toEqual([4, false, 600]);
  });

  test("an empty PNG is an error, not an empty success", async () => {
    const controller = new GeoGebraController();
    controller.setApi(api({ getPNGBase64: () => "" }));
    await expect(controller.executeTool("getPNGBase64", {})).rejects.toThrow();
  });

  test("stops a command batch at the first failure and restores the saved XML", async () => {
    const evaluated: string[] = [];
    let restored: string | undefined;
    const controller = new GeoGebraController();
    controller.setApi(api({
      getXML: () => "<xml>saved</xml>",
      setXML: (value: string) => { restored = value; },
      evalCommand: (command: string) => { evaluated.push(command); return command !== "Bad("; }
    }));

    const result = await controller.executeTool("executeGeoGebraCommands", {
      commands: ["A=(1,2)", "Bad(", "B=(3,4)"],
      restoreOnError: true
    }) as Record<string, unknown>;

    expect(evaluated).toEqual(["A=(1,2)", "Bad("]);
    expect(result.ok).toBe(false);
    expect(result.failedCommandIndex).toBe(2);
    expect(result.lastCompletedCommand).toBe("A=(1,2)");
    expect(restored).toBe("<xml>saved</xml>");
    expect((result.clientMeta as Record<string, unknown>).restoredAfterError).toBe(true);
  });

  test("keeps the inter-command delay at 80ms, and charges nothing for a single command", async () => {
    const controller = new GeoGebraController();
    controller.setApi(api({ evalCommand: () => true }));
    const single = await controller.executeTool("executeGeoGebraCommands", { commands: ["A=(1,2)"] }) as Record<string, unknown>;
    const many = await controller.executeTool("executeGeoGebraCommands", { commands: ["A=(1,2)", "B=(3,4)"] }) as Record<string, unknown>;
    expect((single.clientMeta as Record<string, unknown>).commandDelayMs).toBe(0);
    expect((many.clientMeta as Record<string, unknown>).commandDelayMs).toBe(80);
  });

  test("normalizes 0-255 RGB values at the final applet execution boundary", async () => {
    const evaluated: string[] = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      evalCommand: (command: string) => { evaluated.push(command); return true; }
    }));

    const result = await controller.executeTool("executeGeoGebraCommands", {
      commands: ["SetColor(c, 52, 120, 246)"]
    }) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(evaluated).toEqual(["SetColor(c, 0.20392157, 0.47058824, 0.96470589)"]);
  });

  test("rejects a tool it does not implement", async () => {
    const controller = new GeoGebraController();
    controller.setApi(api({ evalCommand: () => true }));
    await expect(controller.executeTool("notATool", {})).rejects.toThrow();
  });
});
