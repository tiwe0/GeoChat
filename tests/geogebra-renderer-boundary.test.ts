import { describe, expect, test } from "bun:test";
import { configureDefaultView, evaluateCommand } from "../src/renderer/src/geogebra-applet-api";
import { canvasObjectNames, canvasSummary, canvasToml } from "../src/renderer/src/geogebra-canvas-context";
import {
  commandExecutionIntervalMs,
  executeGeoGebraCommands,
  getGeoGebraPNGBase64,
  type GeoGebraExecutionRuntime
} from "../src/renderer/src/geogebra-execution";
import { isGeoGebraLoadResourceUrl, readElementSize } from "../src/renderer/src/geogebra-loader";
import type { GgbAppletApi } from "../src/renderer/src/geogebra-types";

describe("renderer GeoGebra boundary helpers", () => {
  test("summarizes GeoGebra XML objects and expressions without applet state", () => {
    const xml = [
      '<element type="point" label="A"></element>',
      '<element type="conic" label="c"></element>',
      '<expression label="A" exp="(1, 2)"></expression>',
      '<expression label="c" exp="Circle(A, 3)"></expression>',
      '<expression label="f" exp="x^2"></expression>'
    ].join("");

    const summary = canvasSummary(xml, ["A"], true);

    expect(summary).toMatchObject({
      ready: true,
      element_count: 2,
      expression_count: 3,
      selectedObjects: ["A"],
      object_index: {
        conic: ["c"],
        point: ["A"]
      },
      expressions: ["A", "c", "f"],
      xml
    });
    expect(summary.objects).toContainEqual({ name: "c", label: "c", type: "conic", subtype: "circle", definition: "Circle(A, 3)" });
    expect(summary.objects).toContainEqual({ name: "f", label: "f", type: "expression", definition: "x^2" });
    expect([...canvasObjectNames(summary)].sort()).toEqual(["A", "c", "f"]);
    expect(canvasToml(summary)).toContain('point = ["A"]');
  });

  test("normalizes applet command results across available GeoGebra APIs", async () => {
    const jsonApi: GgbAppletApi = {
      asyncEvalCommandResult: () => JSON.stringify({ ok: true, labels: ["A"] })
    };
    await expect(evaluateCommand(jsonApi, "A = (1, 2)")).resolves.toMatchObject({
      command: "A = (1, 2)",
      success: true,
      label: "A",
      error: null
    });

    const failingApi: GgbAppletApi = {
      evalCommandResult: () => false
    };
    await expect(evaluateCommand(failingApi, "BadCommand()")).resolves.toMatchObject({
      success: false,
      error: "GeoGebra command failed"
    });

    await expect(evaluateCommand({}, "A = (1, 2)")).resolves.toMatchObject({
      success: false,
      error: "GeoGebra command API is unavailable"
    });
  });

  test("configures default 2D and 3D views through optional applet APIs", () => {
    const calls: Array<[string, unknown[]]> = [];
    const api: GgbAppletApi = {
      setPerspective: (...args) => calls.push(["setPerspective", args]),
      setViewVisible: (...args) => calls.push(["setViewVisible", args]),
      setAxesVisible: (...args) => calls.push(["setAxesVisible", args]),
      setGridVisible: (...args) => calls.push(["setGridVisible", args]),
      setCoordSystem: (...args) => calls.push(["setCoordSystem", args])
    };

    configureDefaultView(api, "3D");

    expect(calls).toContainEqual(["setPerspective", ["T"]]);
    expect(calls).toContainEqual(["setViewVisible", ["A", false]]);
    expect(calls).toContainEqual(["setViewVisible", ["D", true]]);
    expect(calls).toContainEqual(["setAxesVisible", [3, true, true, true]]);
    expect(calls).toContainEqual(["setGridVisible", [3, true]]);
  });

  test("classifies GeoGebra loader resource URLs without coupling to the controller", () => {
    const assetBase = "http://127.0.0.1:17365/tools/geogebra-assets-v2";

    expect(isGeoGebraLoadResourceUrl(`${assetBase}/deployggb.js`, assetBase)).toBe(true);
    expect(isGeoGebraLoadResourceUrl("http://127.0.0.1:17365/tools/geogebra-assets-v2/HTML5/5.0/web3d/web3d.nocache.js", assetBase)).toBe(true);
    expect(isGeoGebraLoadResourceUrl("http://127.0.0.1:17365/app.js", assetBase)).toBe(false);
    expect(isGeoGebraLoadResourceUrl("", assetBase)).toBe(false);
  });

  test("normalizes zero-sized applet hosts to a usable minimum size", () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        innerWidth: 0,
        innerHeight: 0
      }
    });
    try {
      const element = {
        clientWidth: 0,
        clientHeight: 0,
        getBoundingClientRect: () => ({ width: 0, height: 0 })
      } as HTMLElement;

      expect(readElementSize(element)).toEqual({ width: 1280, height: 720 });
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });

  test("executes command batches with the stable delay and restores saved XML on failure", async () => {
    const originalWindow = globalThis.window;
    const delays: number[] = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        innerWidth: 1440,
        innerHeight: 900,
        setTimeout: (callback: () => void, delay: number) => {
          delays.push(delay);
          callback();
          return 1;
        },
        clearTimeout: () => undefined
      }
    });
    try {
      const savedXml = '<element type="point" label="A"></element><expression label="A" exp="(1, 2)"></expression>';
      const restoredXml: string[] = [];
      let lastResults = 0;
      const api: GgbAppletApi = {
        evalCommandResult: (command) => command !== "Bad()",
        getXML: () => savedXml,
        setXML: (xml) => restoredXml.push(xml)
      };
      const runtime = executionRuntimeForTest(api, {
        setLastResults: (results) => {
          lastResults = results.length;
        }
      });

      const payload = await executeGeoGebraCommands(runtime, ["A = (1, 2)", "Bad()"], { restoreOnError: true });

      expect(payload.ok).toBe(false);
      expect(payload.failedCommand).toBe("Bad()");
      expect(payload.clientMeta.commandDelayMs).toBe(commandExecutionIntervalMs);
      expect(payload.clientMeta.restoredAfterError).toBe(true);
      expect(delays).toContain(commandExecutionIntervalMs);
      expect(restoredXml).toEqual([savedXml]);
      expect(lastResults).toBe(2);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });

  test("exports PNG payloads with clamped options through the execution boundary", () => {
    const api: GgbAppletApi = {
      getPNGBase64: (...args) => {
        expect(args).toEqual([4, false, 600]);
        return "data:image/png;base64,QUJDRA==";
      }
    };

    const payload = getGeoGebraPNGBase64(executionRuntimeForTest(api), {
      exportScale: 99,
      transparent: false,
      dpi: 999
    });

    expect(payload).toMatchObject({
      ok: true,
      base64: "QUJDRA==",
      mediaType: "image/png",
      exportScale: 4,
      transparent: false,
      dpi: 600,
      clientMeta: { source: "geogebra-applet", ready: true, boardId: "test-board" }
    });
  });
});

function executionRuntimeForTest(
  api: GgbAppletApi,
  overrides: Partial<GeoGebraExecutionRuntime> = {}
): GeoGebraExecutionRuntime {
  return {
    boardId: "test-board",
    getApi: () => api,
    isReady: () => true,
    ensureReadyApi: async () => ({ api, error: null }),
    readCanvasContext: () => canvasSummary(api.getXML?.() ?? "", []),
    selectedObjects: () => [],
    setSelectedObjects: () => undefined,
    setLastResults: () => undefined,
    scheduleResizeToContainer: () => undefined,
    pngUnsupportedMessage: () => "PNG unsupported",
    pngEmptyMessage: () => "PNG empty",
    viewport: () => ({ width: 1440, height: 900 }),
    ...overrides
  };
}
