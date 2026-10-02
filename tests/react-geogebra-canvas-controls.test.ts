import { describe, expect, test } from "bun:test";
import { GeoGebraController } from "../src/renderer-react/src/geogebra/controller";
import type { GeoGebraApi } from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

const xmlWithView = (grid: boolean, axes: boolean) =>
  `<geogebra><euclidianView><evSettings axes="${axes}" grid="${grid}"/><axis id="0" show="${axes}"/><axis id="1" show="${axes}"/></euclidianView><construction/></geogebra>`;

const api = (overrides: Partial<GeoGebraApi> = {}): GeoGebraApi => ({
  getXML: () => xmlWithView(false, true),
  setXML: () => undefined,
  ...overrides,
}) as GeoGebraApi;

describe("GeoGebra canvas controls bridge", () => {
  test("does not inspect XML when the applet exposes no interactive canvas controls", () => {
    let xmlReads = 0;
    const controller = new GeoGebraController();
    controller.setApi(api({ getXML: () => { xmlReads += 1; return xmlWithView(true, true); } }));

    expect(controller.canvasControls.getSnapshot()).toMatchObject({
      mode: null,
      gridVisible: null,
      axesVisible: null,
      supportsToolModes: false,
      supportedActions: [],
    });
    expect(xmlReads).toBe(0);
  });

  test("publishes a cached capability snapshot and disables toggles without a reliable query", () => {
    const controller = new GeoGebraController();
    const unavailable = controller.canvasControls.getSnapshot();
    expect(controller.canvasControls.getSnapshot()).toBe(unavailable);

    controller.setApi(api({
      getXML: () => "<geogebra><construction/></geogebra>",
      setGridVisible: () => undefined,
      setAxesVisible: () => undefined,
      undo: () => undefined,
    }));

    const snapshot = controller.canvasControls.getSnapshot();
    expect(snapshot).toMatchObject({
      ready: true,
      blocked: false,
      mode: null,
      gridVisible: null,
      axesVisible: null,
      supportsToolModes: false,
    });
    expect(snapshot.supportedActions).toEqual(["undo"]);
    expect(controller.canvasControls.getSnapshot()).toBe(snapshot);
  });

  test("sets a validated tool mode, follows external mode changes, and cleans up listeners", async () => {
    let mode = 0;
    let registered: ((event: unknown) => void) | null = null;
    const removed: unknown[] = [];
    const changes: number[] = [];
    const firstApi = api({
      getMode: () => mode,
      setMode: (next: number) => { mode = next; },
      registerClientListener: (listener: (event: unknown) => void) => { registered = listener; },
      unregisterClientListener: (listener: unknown) => { removed.push(listener); },
    });
    const controller = new GeoGebraController();
    controller.canvasControls.subscribe(() => changes.push(controller.canvasControls.getSnapshot().mode ?? -1));
    controller.setApi(firstApi);

    expect(controller.canvasControls.getSnapshot()).toMatchObject({ mode: 0, supportsToolModes: true });
    await controller.canvasControls.setToolMode(15);
    expect(controller.canvasControls.getSnapshot().mode).toBe(15);

    mode = 2;
    expect(registered).not.toBeNull();
    const oldListener = registered as (event: unknown) => void;
    oldListener(["setMode", "2"]);
    expect(controller.canvasControls.getSnapshot().mode).toBe(2);

    await expect(controller.canvasControls.setToolMode(-1)).rejects.toThrow(/非负安全整数/);
    await expect(controller.canvasControls.setToolMode(1.5)).rejects.toThrow(/非负安全整数/);

    controller.setApi(api());
    expect(removed).toEqual([registered]);
    mode = 42;
    oldListener(["setMode", "42"]);
    expect(controller.canvasControls.getSnapshot().mode).toBeNull();
    expect(changes).toContain(2);
  });

  test("does not coerce a null native mode into move mode", () => {
    const controller = new GeoGebraController();
    controller.setApi(api({ getMode: () => null }));
    expect(controller.canvasControls.getSnapshot().mode).toBeNull();
  });

  test("reads grid and axes conservatively from public queries and XML fallback", async () => {
    let grid = false;
    let axes = true;
    const queriedViews: number[] = [];
    const gridWrites: Array<[number, boolean]> = [];
    const axesWrites: Array<[number, boolean, boolean, boolean]> = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      getGridVisible: (view: number) => { queriedViews.push(view); return grid; },
      getGraphicsOptions: (view: number) => {
        queriedViews.push(view);
        return { grid, axes: { x: { visible: axes }, y: { visible: axes } } };
      },
      setGridVisible: (view: number, visible: boolean) => { gridWrites.push([view, visible]); grid = visible; },
      setAxesVisible: (view: number, x: boolean, y: boolean, z: boolean) => {
        axesWrites.push([view, x, y, z]);
        axes = x && y;
      },
    }));

    expect(controller.canvasControls.getSnapshot()).toMatchObject({ gridVisible: false, axesVisible: true });
    await controller.canvasControls.performAction("toggleGrid");
    await controller.canvasControls.performAction("toggleAxes");
    expect(controller.canvasControls.getSnapshot()).toMatchObject({ gridVisible: true, axesVisible: false });
    expect(queriedViews.every((view) => view === 1)).toBe(true);
    expect(gridWrites).toEqual([[1, true]]);
    expect(axesWrites).toEqual([[1, false, false, false]]);

    const fallbackController = new GeoGebraController();
    fallbackController.setApi(api({
      getXML: () => xmlWithView(true, false),
      setGridVisible: () => undefined,
      setAxesVisible: () => undefined,
    }));
    expect(fallbackController.canvasControls.getSnapshot()).toMatchObject({ gridVisible: true, axesVisible: false });

    const mixedAxesController = new GeoGebraController();
    mixedAxesController.setApi(api({
      getGraphicsOptions: () => JSON.stringify({ axes: { x: { visible: true }, y: { visible: false } } }),
      setAxesVisible: () => undefined,
    }));
    expect(mixedAxesController.canvasControls.getSnapshot().axesVisible).toBeNull();
    expect(mixedAxesController.canvasControls.getSnapshot().supportedActions).not.toContain("toggleAxes");
  });

  test("maps view actions to documented perspective codes and restores shell chrome", async () => {
    const perspectives: string[] = [];
    const toolbar: boolean[] = [];
    const menu: boolean[] = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      setPerspective: (value: string) => { perspectives.push(value); },
      showToolBar: (visible: boolean) => { toolbar.push(visible); },
      showMenuBar: (visible: boolean) => { menu.push(visible); },
    }));

    await controller.canvasControls.performAction("showAlgebra");
    await controller.canvasControls.performAction("show3D");
    await controller.canvasControls.performAction("showProperties");
    await controller.canvasControls.performAction("showGraphics");

    expect(perspectives).toEqual(["+A", "+T", "+P", "G"]);
    expect(menu).toEqual([false, false, false, false]);
    expect(toolbar).toEqual([false, false, false, false]);
  });

  test("restores the wrapper's default hidden toolbar after layout changes and applet replacement", async () => {
    const firstToolbar: boolean[] = [];
    const secondToolbar: boolean[] = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      setPerspective: () => undefined,
      showToolBar: (visible: boolean) => { firstToolbar.push(visible); },
    }));
    await controller.canvasControls.performAction("show3D");
    expect(firstToolbar).toEqual([false]);

    controller.setApi(api({
      setPerspective: () => undefined,
      showToolBar: (visible: boolean) => { secondToolbar.push(visible); },
    }));
    await controller.canvasControls.performAction("showAlgebra");
    expect(secondToolbar).toEqual([false]);
  });

  test("serializes native mutations and does not restore XML after valid undo or redo", async () => {
    let finishUndo!: () => void;
    const undoDone = new Promise<void>((resolve) => { finishUndo = resolve; });
    const order: string[] = [];
    let restored = 0;
    const controller = new GeoGebraController();
    controller.setApi(api({
      setXML: () => { restored += 1; },
      undo: () => { order.push("undo:start"); return undoDone.then(() => order.push("undo:end")); },
      redo: () => { order.push("redo"); },
    }));

    const undo = controller.canvasControls.performAction("undo");
    const redo = controller.canvasControls.performAction("redo");
    await Promise.resolve();
    expect(order).toEqual(["undo:start"]);
    finishUndo();
    await Promise.all([undo, redo]);
    expect(order).toEqual(["undo:start", "undo:end", "redo"]);
    expect(restored).toBe(0);
  });

  test("rolls back rejected mutations and blocks controls while recovery is required", async () => {
    let restored = 0;
    const rejectedMode = new GeoGebraController();
    rejectedMode.setApi(api({
      getMode: () => 0,
      setMode: () => false,
      setXML: () => { restored += 1; },
    }));
    await expect(rejectedMode.canvasControls.setToolMode(2)).rejects.toThrow(/拒绝/);
    expect(restored).toBe(1);
    expect(rejectedMode.canvasControls.getSnapshot().mode).toBe(0);

    const frozen = new GeoGebraController();
    frozen.setApi(api({ setXML: () => false, undo: () => undefined }));
    await expect(frozen.restoreCanvasXml("<geogebra><construction/></geogebra>"))
      .rejects.toMatchObject({ name: "CanvasRecoveryRequiredError" });
    expect(frozen.canvasControls.getSnapshot().blocked).toBe(true);
    await expect(frozen.canvasControls.performAction("undo")).rejects.toThrow(/等待恢复/);
  });

  test("refreshes controls and hides the native menu after loading a document", async () => {
    let mode = 1;
    let grid = false;
    const menu: boolean[] = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      getMode: () => mode,
      setMode: (next: number) => { mode = next; },
      getGridVisible: () => grid,
      setGridVisible: (visible: boolean) => { grid = visible; },
      getBase64: (callback: (value: string) => void) => callback("old-document"),
      setBase64: (_value: string, callback: () => void) => {
        mode = 15;
        grid = true;
        callback();
      },
      showMenuBar: (visible: boolean) => { menu.push(visible); },
    }));

    await controller.restoreDocumentBase64("new-document");
    expect(controller.canvasControls.getSnapshot()).toMatchObject({ mode: 15, gridVisible: true });
    expect(menu).toEqual([false]);
  });

  test("refreshes controls and restores shell chrome after native reset", async () => {
    let grid = true;
    const menu: boolean[] = [];
    const toolbar: boolean[] = [];
    const controller = new GeoGebraController();
    controller.setApi(api({
      getGridVisible: () => grid,
      setGridVisible: () => undefined,
      reset: () => { grid = false; },
      getViewProperties: () => JSON.stringify({ width: 1000, height: 600, xMin: -10, yMin: -6, invXscale: 0.02, invYscale: 0.02 }),
      setCoordSystem: () => undefined,
      showMenuBar: (visible: boolean) => { menu.push(visible); },
      showToolBar: (visible: boolean) => { toolbar.push(visible); },
    }));
    expect(controller.canvasControls.getSnapshot().gridVisible).toBe(true);

    await controller.executeTool("resetCanvas", {});

    expect(controller.canvasControls.getSnapshot().gridVisible).toBe(false);
    expect(menu).toEqual([false]);
    expect(toolbar).toEqual([false]);
  });
});
