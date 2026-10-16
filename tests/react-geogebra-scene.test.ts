import { describe, expect, test } from "bun:test";
import { readSceneReport, readTextFont } from "../src/renderer-react/src/geogebra/canvas-scene";
import type { GeoGebraApi } from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

function fakeApi(overrides: Partial<GeoGebraApi> = {}): GeoGebraApi {
  return {
    getAllObjectNames: () => ["A", "B", "circle"],
    exists: (name: string) => name === "A" || name === "B" || name === "circle",
    getObjectType: (name: string) => name === "A" ? "point" : "circle",
    getViewProperties: () => JSON.stringify({ width: 600, height: 400, xMin: -6, yMin: -4, invXscale: 0.02, invYscale: 0.02 }),
    getColor: () => "#336699",
    getFilling: () => 0.5,
    getLineStyle: () => 2,
    getLineThickness: () => 4,
    getPointSize: () => 6,
    getPointStyle: () => 1,
    getLabelVisible: () => true,
    getLabelStyle: () => 3,
    getLayer: () => 2,
    getVisible: (_name: string, view: number) => view === 1,
    getStyleXML: () => '<element><font serif="false" sizeM="1.25" style="1"/></element>',
    getAlgorithmXML: (name: string) => name === "circle"
      ? '<command name="Circle"><input a0="A" a1="B"/><output a0="circle"/></command>'
      : '<expression label="A" exp="(1, 2)"/>',
    ...overrides,
  };
}

describe("GeoGebra scene reporting", () => {
  test("reports viewport, styles, explicitly partial dependencies, and unavailable bboxes", () => {
    const report = readSceneReport(fakeApi());
    expect(report.viewport).toEqual({
      status: "available",
      view: 1,
      pixels: [600, 400],
      x: [-6, 6],
      y: [-4, 4],
      pxPerUnitX: 50,
      pxPerUnitY: 50,
      axesEqual: true,
    });
    expect(report.objects.find((object) => object.name === "circle")).toMatchObject({
      name: "circle",
      exists: true,
      type: "circle",
      visible: true,
      visibilityView: 1,
      style: { color: "#336699", filling: 0.5, thickness: 4, font: { serif: "false", sizeM: "1.25", style: "1" } },
      bbox: { status: "unavailable" },
      dependencies: {
        status: "partial",
        parentResolution: "complete",
        parents: ["A", "B"],
        unresolvedInputs: [],
        outputs: ["circle"],
        unresolvedOutputs: [],
        dependents: null,
      },
    });
  });

  test("filters requested objects without silently treating unknown names as existing", () => {
    const report = readSceneReport(fakeApi(), { include: ["style"], objects: ["circle", "missing", "circle"] });
    expect(report.objects.map(({ name, exists }) => ({ name, exists }))).toEqual([
      { name: "circle", exists: true },
      { name: "missing", exists: false },
    ]);
    expect(report.objects[0]).not.toHaveProperty("bbox");
    expect(report.objects[1]).not.toHaveProperty("style");
  });

  test("caps the object inventory at 100 and reports the real total", () => {
    const names = Array.from({ length: 105 }, (_, index) => `O${index}`);
    const report = readSceneReport(fakeApi({ getAllObjectNames: () => names, exists: () => true }));
    expect(report.coverage).toMatchObject({ totalObjects: 105, returnedObjects: 100, truncated: true, limit: 100 });
    expect(report.objects.at(-1)?.name).toBe("O99");
  });

  test("marks failed or missing style getters as unknown instead of inventing defaults", () => {
    const report = readSceneReport(fakeApi({
      getColor: () => { throw new Error("not supported for this object"); },
      getPointSize: undefined,
      getStyleXML: () => "<element/>",
    }), { include: ["style"], objects: ["A"] });
    const style = report.objects[0].style;
    expect(style).not.toHaveProperty("color");
    expect(style).not.toHaveProperty("pointSize");
    expect(style?.unknownFields).toMatchObject({
      color: expect.stringContaining("not supported"),
      pointSize: expect.stringContaining("unavailable"),
      font: expect.stringContaining("no font element"),
    });
  });

  test("rejects invalid view geometry without returning misleading coordinates", () => {
    const report = readSceneReport(fakeApi({ getViewProperties: () => ({ width: 0, height: 400, xMin: 0, yMin: 0, invXscale: 1, invYscale: 1 }) }), { include: ["viewport"] });
    expect(report.viewport).toMatchObject({ status: "unavailable", reason: expect.stringContaining("width must be positive") });
  });

  test("does not classify numeric literals or expressions as object parents", () => {
    const report = readSceneReport(fakeApi({
      getAlgorithmXML: () => '<command name="Circle"><input a0="A" a1="2" a2="r + 1"/><output a0="circle"/></command>',
    }), { include: ["deps"], objects: ["circle"] });
    expect(report.objects[0].dependencies).toMatchObject({
      status: "partial",
      parentResolution: "partial",
      parents: ["A"],
      unresolvedInputs: ["2", "r + 1"],
      outputs: ["circle"],
    });
  });

  test("reports unknown dependencies unless independence is positively confirmed", () => {
    const unknown = readSceneReport(fakeApi({ isIndependent: undefined }), { include: ["deps"], objects: ["A"] });
    expect(unknown.objects[0].dependencies).toMatchObject({ status: "unknown", parentResolution: "unknown", parents: null });

    const free = readSceneReport(fakeApi({ isIndependent: () => true }), { include: ["deps"], objects: ["A"] });
    expect(free.objects[0].dependencies).toMatchObject({
      status: "partial",
      parentResolution: "complete",
      parents: [],
      outputs: ["A"],
      dependents: null,
    });
  });

  test("enforces include enums and the 100-object input limit for direct callers", () => {
    expect(() => readSceneReport(fakeApi(), { objects: Array.from({ length: 101 }, (_, index) => `O${index}`) })).toThrow(/at most 100/);
    expect(() => readSceneReport(fakeApi(), { objects: "A" as never })).toThrow(/array/);
    expect(() => readSceneReport(fakeApi(), { include: "viewport" as never })).toThrow(/array/);
    expect(() => readSceneReport(fakeApi(), { include: ["viewport", "invalid" as never] })).toThrow(/include may contain only/);
  });

  test("reads text font metadata from public style XML", () => {
    expect(readTextFont(fakeApi(), "A")).toEqual({ serif: "false", sizeM: "1.25", style: "1" });
  });
});
