import { describe, expect, test } from "bun:test";
import { measureCanvasLayout } from "../src/renderer-react/src/geogebra/canvas-layout";
import type { GeoGebraApi } from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

type Point = { x: number; y: number };

function layoutApi(options: {
  names?: string[];
  types?: Record<string, string>;
  textBounds?: Record<string, [Point, Point]>;
  listItems?: Record<string, string[]>;
  view?: Record<string, number>;
  deleteResult?: boolean;
  preserveOnDelete?: boolean;
  rejectExpression?: RegExp;
} = {}) {
  const names = options.names ?? ["Alpha", "Beta"];
  const types = { Alpha: "text", Beta: "text", ...options.types };
  const textBounds = options.textBounds ?? {
    Alpha: [{ x: 0, y: 0 }, { x: 2, y: 1 }],
    Beta: [{ x: 1, y: 0.5 }, { x: 3, y: 1.5 }],
  };
  const probes = new Map<string, { type: string; value?: number; point?: Point; source?: string }>();
  const evaluated: string[] = [];
  const deleted: string[] = [];

  const api: GeoGebraApi = {
    getAllObjectNames: () => names,
    getViewProperties: () => JSON.stringify(options.view ?? {
      width: 100,
      height: 100,
      xMin: 0,
      yMin: 0,
      invXscale: 0.1,
      invYscale: 0.1,
    }),
    getObjectType: (name: string) => probes.get(name)?.type ?? types[name] ?? "point",
    getLabelVisible: () => false,
    getVisible: () => true,
    exists: (name: string) => names.includes(name) || probes.has(name),
    evalCommand: (command: string) => {
      evaluated.push(command);
      if (options.rejectExpression?.test(command)) return false;
      const match = /^(gcLayoutProbe[\da-z]+) = (.+)$/.exec(command);
      if (!match) return false;
      const [, probe, expression] = match;
      const length = /^Length\(([^)]+)\)$/.exec(expression);
      const element = /^Element\(([^,]+), (\d+)\)$/.exec(expression);
      const corner = /^Corner\(([^,]+), ([13])\)$/.exec(expression);
      if (length) {
        probes.set(probe, { type: "numeric", value: options.listItems?.[length[1]]?.length ?? 0 });
      } else if (element) {
        const source = options.listItems?.[element[1]]?.[Number(element[2]) - 1];
        if (!source) return false;
        probes.set(probe, { type: types[source] ?? "text", source });
      } else if (corner) {
        const target = probes.get(corner[1])?.source ?? corner[1];
        const point = textBounds[target]?.[corner[2] === "1" ? 0 : 1];
        probes.set(probe, { type: "point", point });
      } else {
        const source = probes.get(expression)?.source ?? expression;
        probes.set(probe, { type: types[source] ?? "text", source });
      }
      return true;
    },
    isDefined: (name: string) => Boolean(probes.get(name)?.point),
    getValue: (name: string) => probes.get(name)?.value,
    getXcoord: (name: string) => probes.get(name)?.point?.x,
    getYcoord: (name: string) => probes.get(name)?.point?.y,
    deleteObject: (name: string) => {
      deleted.push(name);
      if (!options.preserveOnDelete) probes.delete(name);
      return options.deleteResult ?? true;
    },
    getXML: () => "<element/>",
  };
  return { api, evaluated, deleted, probes };
}

describe("GeoGebra rendered text layout measurement", () => {
  test("reports real text-corner collisions and partial viewport overflow without copying named text", async () => {
    const fixture = layoutApi({
      textBounds: {
        Alpha: [{ x: -1, y: 1 }, { x: 2, y: 3 }],
        Beta: [{ x: 1, y: 2 }, { x: 4, y: 4 }],
      },
    });
    const result = await measureCanvasLayout(fixture.api);

    expect(result.status).toBe("issues_found");
    expect(result.verified).toBe(false);
    expect(result.labelCollisions).toEqual([{ a: "Alpha", b: "Beta", overlapPx: [10, 10] }]);
    expect(result.outsideViewport).toEqual([{ object: "Alpha", extent: "partial", sides: ["left"] }]);
    expect(result.boxes[0]).toMatchObject({
      id: "Alpha",
      source: "applet-text-corner",
    });
    expect(result.coverage).toMatchObject({ complete: true, measuredTextBoxes: 2, unknown: [] });
    expect(fixture.probes.size).toBe(0);
    expect(fixture.deleted.length).toBe(4);
    expect(fixture.evaluated.some((command) => / = Alpha$/.test(command))).toBe(false);
  });

  test("measures text items inside a list and marks non-text items unknown", async () => {
    const fixture = layoutApi({
      names: ["Labels", "T1", "P1"],
      types: { Labels: "list", T1: "text", P1: "point" },
      listItems: { Labels: ["T1", "P1"] },
      textBounds: { T1: [{ x: 2, y: 2 }, { x: 3, y: 3 }] },
    });
    const result = await measureCanvasLayout(fixture.api, { objects: ["Labels"] });

    expect(result.boxes.map((box) => box.id)).toEqual(["Labels[1]"]);
    expect(result.boxes[0]).toMatchObject({ object: "Labels", elementIndex: 1 });
    expect(result.coverage).toMatchObject({
      complete: false,
      measuredTextBoxes: 1,
      unknown: [{ name: "Labels[2]", reason: "list item is not text" }],
    });
  });

  test("caps list inspection at 16 items and reports truncated coverage", async () => {
    const items = Array.from({ length: 20 }, (_, index) => `T${index + 1}`);
    const fixture = layoutApi({
      names: ["Labels", ...items],
      types: { Labels: "list", ...Object.fromEntries(items.map((name) => [name, "text"])) },
      listItems: { Labels: items },
      textBounds: Object.fromEntries(items.map((name, index) => [
        name,
        [{ x: index, y: 1 }, { x: index + 0.5, y: 1.5 }],
      ])),
    });

    const result = await measureCanvasLayout(fixture.api, { objects: ["Labels"] });
    expect(result.boxes).toHaveLength(16);
    expect(result.coverage).toMatchObject({ truncated: true, complete: false, limits: { listItemsPerList: 16 } });
    expect(fixture.evaluated.some((command) => command.includes("Element(Labels, 17)"))).toBe(false);
  });

  test("returns unavailable before mutation when APIs or requested names are unsafe", async () => {
    let evalCalls = 0;
    const missing = await measureCanvasLayout({ getAllObjectNames: () => [] });
    expect(missing).toMatchObject({ status: "unavailable", verified: false, labelCollisions: null });

    const fixture = layoutApi({ names: ["Bad Name"], types: { "Bad Name": "text" } });
    fixture.api.evalCommand = () => { evalCalls += 1; return true; };
    const unsafe = await measureCanvasLayout(fixture.api, { objects: ["Bad Name"] });
    expect(unsafe).toMatchObject({ status: "unavailable", coverage: { complete: false } });
    expect(evalCalls).toBe(0);
  });

  test("cleans up existing probes when a later measurement fails", async () => {
    const fixture = layoutApi({ rejectExpression: /Corner\(.+, 3\)/ });
    await expect(measureCanvasLayout(fixture.api)).rejects.toThrow("rejected layout probe");
    expect(fixture.probes.size).toBe(0);
    expect(fixture.deleted.length).toBeGreaterThan(0);
  });

  test("throws when cleanup is rejected so the outer transaction can roll back", async () => {
    const fixture = layoutApi({ deleteResult: false });
    await expect(measureCanvasLayout(fixture.api, { objects: ["Alpha"] })).rejects.toThrow("Failed to clean up layout probes");
  });

  test("treats hidden, absolute-screen, and zero-area text as unchecked", async () => {
    const fixture = layoutApi({
      names: ["Hidden", "Absolute", "Flat"],
      types: { Hidden: "text", Absolute: "text", Flat: "text" },
      textBounds: { Flat: [{ x: 1, y: 1 }, { x: 1, y: 2 }] },
    });
    fixture.api.getVisible = (name: string) => name !== "Hidden";
    fixture.api.getXML = (name: string) => name === "Absolute"
      ? '<element><absoluteScreenLocation x="12" y="24"/></element>'
      : "<element/>";

    const result = await measureCanvasLayout(fixture.api);
    expect(result.boxes).toEqual([]);
    expect(result.labelCollisions).toBeNull();
    expect(result.coverage).toMatchObject({
      complete: false,
      unknown: [
        { name: "Absolute", reason: expect.stringContaining("absolute-screen") },
        { name: "Flat", reason: expect.stringContaining("undefined or non-finite") },
      ],
    });
    expect(fixture.evaluated.some((command) => command.includes("Absolute"))).toBe(false);
    expect(fixture.evaluated.some((command) => command.includes("Hidden"))).toBe(false);
  });

  test("detects a silent no-op delete by checking probe existence", async () => {
    const fixture = layoutApi({ preserveOnDelete: true });
    await expect(measureCanvasLayout(fixture.api, { objects: ["Alpha"] })).rejects.toThrow("still exists after deletion");
  });

  test("skips hidden parent lists and objects only visible in Graphics2 before creating probes", async () => {
    const fixture = layoutApi({
      names: ["Labels", "Secondary"],
      types: { Labels: "list", Secondary: "text" },
      listItems: { Labels: ["T1"] },
    });
    fixture.api.getVisible = (_name: string, view: number) => view !== 1;
    const result = await measureCanvasLayout(fixture.api);
    expect(result.boxes).toEqual([]);
    expect(fixture.evaluated).toEqual([]);
  });

  test("returns null collision coverage when no text bounds can be measured", async () => {
    const fixture = layoutApi({ names: ["P"], types: { P: "point" } });
    const result = await measureCanvasLayout(fixture.api);
    expect(result).toMatchObject({
      status: "unavailable",
      verified: false,
      labelCollisions: null,
      outsideViewport: null,
      coverage: { complete: false },
    });
  });
});
