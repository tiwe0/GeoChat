import { describe, expect, test } from "bun:test";
import { evaluateCommand, normalizeCommandResult } from "../src/renderer-react/src/geogebra/command-executor";
import { GeoGebraController } from "../src/renderer-react/src/geogebra/controller";
import {
  DEFAULT_GEOGEBRA_FILE_FEATURES_ENABLED,
  DEFAULT_GEOGEBRA_MENU_VISIBLE,
  DEFAULT_GEOGEBRA_TOOLBAR_VISIBLE,
  type GeoGebraApi,
} from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

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
const api = (overrides: Partial<GeoGebraApi>): GeoGebraApi => ({
  getXML: () => "<xml>headless-snapshot</xml>",
  setXML: () => undefined,
  ...overrides,
}) as GeoGebraApi;

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
  test("keeps vendor persistence controls disabled and the construction toolbar collapsed", () => {
    expect(DEFAULT_GEOGEBRA_FILE_FEATURES_ENABLED).toBe(false);
    expect(DEFAULT_GEOGEBRA_MENU_VISIBLE).toBe(false);
    expect(DEFAULT_GEOGEBRA_TOOLBAR_VISIBLE).toBe(false);
  });

  test("refuses every tool before the applet is mounted", async () => {
    const controller = new GeoGebraController();
    expect(controller.ready).toBe(false);
    await expect(controller.executeTool("getCanvasContext", {})).rejects.toThrow();
  });

  test("forwards both toolbar visibility states when the shell owns document persistence", () => {
    const visibility: boolean[] = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      showToolBar: (visible: boolean) => { visibility.push(visible); },
    }));

    expect(controller.setToolbarVisible(true)).toBe(true);
    expect(controller.setToolbarVisible(false)).toBe(false);
    expect(visibility).toEqual([true, false]);
  });

  test("reports an unavailable toolbar API instead of faking UI state", () => {
    const controller = new GeoGebraController();
    controller.setApi(api({}));
    expect(() => controller.setToolbarVisible(true)).toThrow(/工具栏切换 API/);
  });

  test("restores a persisted document through the transactional canvas boundary", async () => {
    let restored = "";
    const controller = new GeoGebraController();
    controller.setApi(api({
      getXML: () => "<geogebra/>",
      setXML: (xml: string) => { restored = xml; },
    }));
    await controller.restoreCanvasXml("<geogebra><construction/></geogebra>");
    expect(restored).toBe("<geogebra><construction/></geogebra>");
  });

  test("exports and restores complete GeoGebra files through the base64 APIs", async () => {
    const documentBase64 = "UEsDBI01UE5H";
    let restored = "";
    const controller = new GeoGebraController();
    controller.setApi(api({
      getBase64: (callback: (value: string) => void) => callback(documentBase64),
      setBase64: (value: string, callback: () => void) => {
        restored = value;
        callback();
      },
    }));
    expect(await controller.captureDocumentBase64()).toBe(documentBase64);
    await controller.restoreDocumentBase64(documentBase64);
    expect(restored).toBe(documentBase64);
  });

  test("exports a document only after the active canvas transaction reaches a stable state", async () => {
    let finishCommand!: (value: string) => void;
    let commandStarted!: () => void;
    const commandStart = new Promise<void>((resolve) => { commandStarted = resolve; });
    const commandResult = new Promise<string>((resolve) => { finishCommand = resolve; });
    let exportCount = 0;
    const controller = new GeoGebraController();
    controller.setApi(api({
      asyncEvalCommandResult: () => {
        commandStarted();
        return commandResult;
      },
      getBase64: (callback: (value: string) => void) => {
        exportCount += 1;
        callback("stable-document");
      },
    }));

    const command = controller.executeTool("executeGeoGebraCommands", { commands: ["A=(1,2)"] });
    await commandStart;
    const capture = controller.captureDocumentBase64();
    await Promise.resolve();
    expect(exportCount).toBe(0);

    finishCommand(JSON.stringify({ ok: true, labels: ["A"] }));
    await command;
    expect(await capture).toBe("stable-document");
    expect(exportCount).toBe(1);
  });

  test("serializes complete document restore after a failing in-flight canvas transaction", async () => {
    let finishCommand!: (value: string) => void;
    let commandStarted!: () => void;
    const commandStart = new Promise<void>((resolve) => { commandStarted = resolve; });
    const commandResult = new Promise<string>((resolve) => { finishCommand = resolve; });
    const events: string[] = [];
    let canvasState = "<xml>before-command</xml>";
    const controller = new GeoGebraController();
    controller.setApi(api({
      getXML: () => canvasState,
      asyncEvalCommandResult: () => {
        commandStarted();
        return commandResult;
      },
      setXML: (xml: string) => {
        events.push(`rollback:${xml}`);
        canvasState = xml;
      },
      getBase64: (callback: (value: string) => void) => callback(`base64:${canvasState}`),
      setBase64: (base64: string, callback: () => void) => {
        events.push(`document:${base64}`);
        canvasState = `document:${base64}`;
        callback();
      },
    }));

    const pendingCommand = controller.executeTool("executeGeoGebraCommands", { commands: ["Bad("] });
    await commandStart;
    const pendingOpen = controller.restoreDocumentBase64("UEsDBA==");
    await Promise.resolve();
    expect(events).toEqual([]);

    finishCommand(JSON.stringify({ ok: false, error: "command rejected" }));
    await pendingCommand;
    await pendingOpen;

    expect(events).toEqual([
      "rollback:<xml>before-command</xml>",
      "document:UEsDBA==",
    ]);
    expect(canvasState).toBe("document:UEsDBA==");
  });

  test("supersedes an older pending complete-document restore before committing the newer document", async () => {
    const callbacks: Array<{ base64: string; complete: () => void }> = [];
    let firstRestoreStarted!: () => void;
    let rollbackStarted!: () => void;
    let secondRestoreStarted!: () => void;
    const firstStart = new Promise<void>((resolve) => { firstRestoreStarted = resolve; });
    const rollbackStart = new Promise<void>((resolve) => { rollbackStarted = resolve; });
    const secondStart = new Promise<void>((resolve) => { secondRestoreStarted = resolve; });
    const events: string[] = [];
    let canvasState = "<xml>initial</xml>";
    const controller = new GeoGebraController();
    controller.setApi(api({
      getXML: () => canvasState,
      setXML: (xml: string) => {
        events.push(`rollback:${xml}`);
        canvasState = xml;
      },
      getBase64: (callback: (value: string) => void) => callback(`base64:${canvasState}`),
      setBase64: (base64: string, callback: () => void) => {
        events.push(`document:${base64}`);
        canvasState = `document:${base64}`;
        callbacks.push({ base64, complete: callback });
        if (base64 === "b2xk") firstRestoreStarted();
        else if (base64 === "bmV3") secondRestoreStarted();
        else rollbackStarted();
      },
    }));

    const older = controller.restoreDocumentBase64("b2xk");
    await firstStart;
    const newer = controller.restoreDocumentBase64("bmV3");
    callbacks[0]!.complete();
    await rollbackStart;
    expect(callbacks[1]?.base64).toBe("base64:<xml>initial</xml>");
    callbacks[1]!.complete();
    await expect(older).rejects.toMatchObject({ name: "AbortError" });
    await secondStart;
    callbacks[2]!.complete();
    await newer;

    expect(events).toEqual([
      "document:b2xk",
      "document:base64:<xml>initial</xml>",
      "document:bmV3",
    ]);
    expect(canvasState).toBe("document:bmV3");
  });

  test("surfaces complete document export and restore failures", async () => {
    const exportController = new GeoGebraController();
    exportController.setApi(api({
      getBase64: (callback: (value: string) => void) => callback(""),
    }));
    await expect(exportController.captureDocumentBase64()).rejects.toThrow(/空文档/);

    const controller = new GeoGebraController(undefined, 5);
    controller.setApi(api({
      getBase64: (callback: (value: string) => void) => callback("rollback-base64"),
      setBase64: (base64: string, callback: () => void) => {
        if (base64 === "rollback-base64") {
          callback();
          return;
        }
        return false;
      },
    }));
    await expect(controller.restoreDocumentBase64("UEsDBA==")).rejects.toThrow(/rejected/);
  });

  test("freezes late document loads until their callback completes and explicit recovery restores the prior file", async () => {
    const applied: string[] = [];
    const pending: Array<{ base64: string; complete: () => void }> = [];
    let canvasState = "complete-before";
    let recoveryStarted!: () => void;
    let newerStarted!: () => void;
    const recoveryStart = new Promise<void>((resolve) => { recoveryStarted = resolve; });
    const newerStart = new Promise<void>((resolve) => { newerStarted = resolve; });
    const controller = new GeoGebraController(undefined, 5);
    controller.setApi(api({
      getBase64: (callback: (value: string) => void) => callback("complete-before"),
      setBase64: (base64: string, callback: () => void) => {
        applied.push(base64);
        pending.push({
          base64,
          complete: () => {
            canvasState = base64;
            callback();
          },
        });
        if (base64 === "complete-before") recoveryStarted();
        if (base64 === "newer-document") newerStarted();
      },
    }));

    await expect(controller.restoreDocumentBase64("late-old-document"))
      .rejects.toMatchObject({ name: "CanvasRecoveryRequiredError" });
    expect(controller.canvasRecoveryState).toMatchObject({ frozen: true, label: "document:restore" });
    expect(applied).toEqual(["late-old-document"]);

    await expect(controller.restoreDocumentBase64("newer-document"))
      .rejects.toMatchObject({ name: "CanvasRecoveryRequiredError" });
    await expect(controller.captureDocumentBase64())
      .rejects.toMatchObject({ name: "CanvasRecoveryRequiredError" });
    await expect(controller.retryCanvasRecovery())
      .rejects.toMatchObject({ name: "CanvasRecoveryRequiredError" });
    expect(applied).toEqual(["late-old-document"]);

    pending[0]!.complete();
    expect(canvasState).toBe("late-old-document");

    const recovery = controller.retryCanvasRecovery();
    await recoveryStart;
    expect(pending[1]?.base64).toBe("complete-before");
    pending[1]!.complete();
    await recovery;
    expect(controller.canvasRecoveryState).toBeNull();
    expect(canvasState).toBe("complete-before");

    const newer = controller.restoreDocumentBase64("newer-document");
    await newerStart;
    expect(pending[2]?.base64).toBe("newer-document");
    pending[2]!.complete();
    await newer;
    expect(canvasState).toBe("newer-document");
  });

  test("keeps recovery frozen when the recovery write itself times out, then retries after its late callback", async () => {
    const pending: Array<{ base64: string; complete: () => void }> = [];
    let canvasState = "complete-before";
    let finalRetryStarted!: () => void;
    const finalRetryStart = new Promise<void>((resolve) => { finalRetryStarted = resolve; });
    const controller = new GeoGebraController(undefined, 5);
    controller.setApi(api({
      getBase64: (callback: (value: string) => void) => callback("complete-before"),
      setBase64: (base64: string, callback: () => void) => {
        pending.push({
          base64,
          complete: () => {
            canvasState = base64;
            callback();
          },
        });
        if (pending.length === 3) finalRetryStarted();
      },
    }));

    await expect(controller.restoreDocumentBase64("late-document"))
      .rejects.toMatchObject({ name: "CanvasRecoveryRequiredError" });
    pending[0]!.complete();

    await expect(controller.retryCanvasRecovery())
      .rejects.toMatchObject({ name: "CanvasRecoveryRequiredError" });
    expect(controller.canvasRecoveryState).toMatchObject({ frozen: true, label: "document:restore" });
    expect(pending.map(({ base64 }) => base64)).toEqual(["late-document", "complete-before"]);

    pending[1]!.complete();
    expect(canvasState).toBe("complete-before");

    const successfulRetry = controller.retryCanvasRecovery();
    await finalRetryStart;
    expect(pending[2]?.base64).toBe("complete-before");
    pending[2]!.complete();
    await successfulRetry;
    expect(controller.canvasRecoveryState).toBeNull();
    expect(canvasState).toBe("complete-before");
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

  test("runs command batches without an artificial inter-command delay", async () => {
    const controller = new GeoGebraController();
    controller.setApi(api({ evalCommand: () => true }));
    const single = await controller.executeTool("executeGeoGebraCommands", { commands: ["A=(1,2)"] }) as Record<string, unknown>;
    const many = await controller.executeTool("executeGeoGebraCommands", { commands: ["A=(1,2)", "B=(3,4)"] }) as Record<string, unknown>;
    expect((single.clientMeta as Record<string, unknown>).commandDelayMs).toBe(0);
    expect((many.clientMeta as Record<string, unknown>).commandDelayMs).toBe(0);
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

  test("freezes on setXML false and notifies again after an explicit recovery retry", async () => {
    let restoreWorks = false;
    const states: Array<unknown> = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      getXML: () => "<xml>initial</xml>",
      setXML: () => restoreWorks,
    }));
    const unsubscribe = controller.subscribeCanvasRecovery(() => {
      states.push(controller.canvasRecoveryState);
    });

    await expect(controller.executeTool("__restoreCanvasXml", { xml: "<xml>next</xml>" }))
      .rejects.toMatchObject({ name: "CanvasRecoveryRequiredError" });
    expect(controller.canvasRecoveryState).toMatchObject({ frozen: true, label: "tool:__restoreCanvasXml" });
    expect(states).toHaveLength(1);

    restoreWorks = true;
    await controller.retryCanvasRecovery();
    expect(controller.canvasRecoveryState).toBeNull();
    expect(states).toEqual([expect.objectContaining({ frozen: true }), null]);
    unsubscribe();
  });

  test("freezes on setXML throw and clears the subscribed state after applet replacement", async () => {
    const states: Array<unknown> = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      getXML: () => "<xml>initial</xml>",
      setXML: () => { throw new Error("setXML bridge failed"); },
    }));
    controller.subscribeCanvasRecovery(() => {
      states.push(controller.canvasRecoveryState);
    });

    await expect(controller.executeTool("__restoreCanvasXml", { xml: "<xml>next</xml>" }))
      .rejects.toMatchObject({ name: "CanvasRecoveryRequiredError" });
    expect(controller.canvasRecoveryState).toMatchObject({ frozen: true, error: "setXML bridge failed" });

    controller.setApi(api({ getXML: () => "<xml>replacement</xml>" }));
    expect(controller.canvasRecoveryState).toBeNull();
    expect(states).toEqual([expect.objectContaining({ frozen: true }), null]);
  });

  test("configures business animation and inspects objects through public applet APIs", async () => {
    const values = new Map<string, number>([["t", 0]]);
    const nativeAnimationUpdates: Array<[string, boolean]> = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      exists: (name: string) => values.has(name),
      getObjectType: () => "numeric",
      getValue: (name: string) => values.get(name),
      getValueString: (name: string) => String(values.get(name)),
      getVisible: () => true,
      setAnimating: (name: string, enabled: boolean) => { nativeAnimationUpdates.push([name, enabled]); },
      setValue: (name: string, value: number) => { values.set(name, value); }
    }));

    const configured = await controller.executeTool("configureGeoGebraAnimation", {
      object: "t", from: 0, to: 6, durationMs: 20_000, mode: "once", autoplay: false
    }) as Record<string, unknown>;
    expect(configured.ok).toBe(true);
    expect(values.get("t")).toBe(0);
    expect(nativeAnimationUpdates).toEqual([["t", false]]);
    expect((configured.clientMeta as Record<string, unknown>).xmlUsed).toBe(false);

    const inspected = await controller.executeTool("inspectGeoGebraObjects", { objects: ["t", "missing"] }) as Record<string, unknown>;
    const objects = inspected.objects as Array<Record<string, unknown>>;
    expect(objects[0]).toMatchObject({ name: "t", exists: true, objectType: "numeric", value: 0, visible: true });
    expect(objects[1]).toEqual({ name: "missing", exists: false });
  });

  test("autoplays a configured business animation by default", async () => {
    const values = new Map<string, number>([["t", 0]]);
    const controller = new GeoGebraController();
    controller.setApi(api({
      exists: (name: string) => values.has(name),
      getObjectType: () => "numeric",
      setAnimating: () => undefined,
      setValue: (name: string, value: number) => { values.set(name, value); }
    }));

    const configured = await controller.executeTool("configureGeoGebraAnimation", {
      object: "t", from: 0, to: 6, durationMs: 20_000, mode: "once"
    }) as { animation: { status: string } };

    expect(configured.animation.status).toBe("running");
  });

  test("accepts continuous mode for a monotonically increasing applet parameter", async () => {
    const values = new Map<string, number>([["time", 0]]);
    const controller = new GeoGebraController();
    controller.setApi(api({
      exists: (name: string) => values.has(name),
      getObjectType: () => "numeric",
      setAnimating: () => undefined,
      setValue: (name: string, value: number) => { values.set(name, value); }
    }));

    const configured = await controller.executeTool("configureGeoGebraAnimation", {
      object: "time", from: 0, to: 1, durationMs: 20_000, mode: "continuous", easing: "ease_in_out", autoplay: false
    }) as { animation: { mode: string; easing: string; status: string } };

    expect(configured.animation).toMatchObject({ mode: "continuous", easing: "linear", status: "configured" });
  });
});
