import { describe, expect, test } from "bun:test";
import type { GeoGebraApi } from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";
import {
  createGeoGebraSelectionContextBridge,
  fusionSelectionObjectNamesForSubmit,
  readGeoGebraSelectionContext,
  type GeoGebraSelectionContext,
} from "../src/renderer-react/src/features/fusion-mode/selection-context";

const observedAt = new Date("2026-09-24T08:00:00.000Z");

describe("fusion GeoGebra selection context", () => {
  test("freezes the synchronous submit refresh instead of the previous React snapshot", () => {
    expect(fusionSelectionObjectNamesForSubmit(
      { status: "known", objectNames: ["oldPoint"] },
      { status: "known", objectNames: ["A", "circle1"] },
    )).toEqual(["A", "circle1"]);
    expect(fusionSelectionObjectNamesForSubmit(
      { status: "known", objectNames: ["oldPoint"] },
      { status: "empty", objectNames: [] },
    )).toEqual([]);
    expect(fusionSelectionObjectNamesForSubmit(
      { status: "known", objectNames: ["A"] },
      undefined,
    )).toEqual(["A"]);
  });

  test("reports real selected object names and distinguishes empty from unavailable", () => {
    expect(readGeoGebraSelectionContext({
      getSelectedObjectCount: () => 3,
      getSelectedObject: (index: number) => [" A ", "circle1", "A"][index],
    }, () => observedAt)).toEqual({
      status: "known",
      objectNames: ["A", "circle1"],
      observedAt: observedAt.toISOString(),
    });

    expect(readGeoGebraSelectionContext({
      getSelectedObjectCount: () => 0,
      getSelectedObject: () => "",
    }, () => observedAt)).toEqual({
      status: "empty",
      objectNames: [],
      observedAt: observedAt.toISOString(),
    });

    expect(readGeoGebraSelectionContext({})).toEqual({
      status: "unavailable",
      objectNames: [],
    });
  });

  test("rejects incomplete labels rather than inventing or silently dropping object names", () => {
    expect(readGeoGebraSelectionContext({
      getSelectedObjectCount: () => 2,
      getSelectedObject: (index: number) => index === 0 ? "A" : "",
    })).toEqual({ status: "unavailable", objectNames: [] });
  });

  test("pairs event registration and release, then re-reads authoritative selection", () => {
    let selected = ["A"];
    let registered: ((event: unknown) => void) | undefined;
    const unregistered: unknown[] = [];
    const changes: GeoGebraSelectionContext[] = [];
    const applet: GeoGebraApi = {
      getSelectedObjectCount: () => selected.length,
      getSelectedObject: (index: number) => selected[index],
      registerClientListener(listener: (event: unknown) => void) { registered = listener; },
      unregisterClientListener(listener: unknown) { unregistered.push(listener); },
    };

    const bridge = createGeoGebraSelectionContextBridge(applet, {
      onChange: (context) => changes.push(context),
      now: () => observedAt,
    });
    expect(bridge.mode).toBe("events");
    expect(bridge.getSnapshot().objectNames).toEqual(["A"]);

    selected = ["lineAB"];
    registered?.(["select", "caption that must not be trusted"]);
    expect(changes.at(-1)?.objectNames).toEqual(["lineAB"]);

    selected = ["B"];
    registered?.(["update", "lineAB"]);
    expect(changes).toHaveLength(1);

    bridge.dispose();
    expect(unregistered).toEqual([registered]);
    registered?.(["deselect", "lineAB"]);
    expect(changes).toHaveLength(1);
  });

  test("uses explicit interaction-boundary reads when paired events are unavailable", () => {
    let reads = 0;
    const bridge = createGeoGebraSelectionContextBridge({
      getSelectedObjectCount: () => { reads += 1; return 1; },
      getSelectedObject: () => "P",
      registerClientListener: () => undefined,
      // Missing unregisterClientListener intentionally disables event mode.
    }, { now: () => observedAt });

    expect(bridge.mode).toBe("discrete");
    expect(bridge.getSnapshot()).toEqual({ status: "unavailable", objectNames: [] });
    expect(reads).toBe(0);

    expect(bridge.refresh("focus").objectNames).toEqual(["P"]);
    expect(bridge.refresh("submit").objectNames).toEqual(["P"]);
    expect(bridge.refresh("tool-complete").objectNames).toEqual(["P"]);
    expect(reads).toBe(3);
    expect(() => bridge.refresh("interval" as never)).toThrow("Unsupported GeoGebra selection refresh boundary");
  });

  test("falls back to discrete mode when listener registration fails", () => {
    const bridge = createGeoGebraSelectionContextBridge({
      getSelectedObjectCount: () => 0,
      getSelectedObject: () => "",
      registerClientListener: () => { throw new Error("unsupported callback form"); },
      unregisterClientListener: () => undefined,
    });

    expect(bridge.mode).toBe("discrete");
    expect(bridge.getSnapshot()).toEqual({ status: "unavailable", objectNames: [] });
    expect(bridge.refresh("submit").status).toBe("empty");
  });
});
