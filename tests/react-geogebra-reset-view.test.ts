import { describe, expect, test } from "bun:test";
import { GeoGebraController } from "../src/renderer-react/src/geogebra/controller";
import type { GeoGebraApi } from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

function fixture(width = 1000, height = 600) {
  let objects = ["A"];
  let view = { width, height, xMin: 20, yMin: 10, invXscale: 0.1, invYscale: 0.4 };
  const calls: string[] = [];
  const api: GeoGebraApi = {
    getXML: () => JSON.stringify({ objects, view }),
    setXML: (xml: string) => {
      ({ objects, view } = JSON.parse(xml));
      calls.push("rollback");
    },
    reset: () => { objects = []; calls.push("reset"); },
    getViewProperties: (id: number) => {
      expect(id).toBe(1);
      return JSON.stringify(view);
    },
    setCoordSystem: (...bounds: number[]) => {
      expect(bounds).toHaveLength(4);
      const [xMin, xMax, yMin, yMax] = bounds;
      view = { ...view, xMin, yMin, invXscale: (xMax - xMin) / view.width, invYscale: (yMax - yMin) / view.height };
      calls.push("coordinates");
    },
  };
  const controller = new GeoGebraController();
  controller.setApi(api);
  return { controller, api, calls, getView: () => view, getObjects: () => objects, resize: (w: number, h: number) => { view = { ...view, width: w, height: h }; } };
}

describe("GeoGebra reset viewport", () => {
  for (const [width, height] of [[1000, 600], [400, 800], [640, 640]]) {
    test(`clears and restores a centered 1:1 viewport at ${width}x${height}`, async () => {
      const f = fixture(width, height);
      expect(await f.controller.executeTool("resetCanvas", {})).toMatchObject({ ok: true, reset: true });
      expect(f.getObjects()).toEqual([]);
      expect(f.calls).toEqual(["reset", "coordinates"]);
      expect(f.getView()).toMatchObject({ xMin: -width / 100, yMin: -height / 100, invXscale: 0.02, invYscale: 0.02 });
    });
  }

  test("reads final dimensions after an explicit perspective change", async () => {
    const f = fixture();
    f.api.setPerspective = (mode: string) => {
      expect(mode).toBe("G");
      f.resize(800, 500);
      f.calls.push("perspective");
    };
    await f.controller.executeTool("resetCanvas", { perspective: "G" });
    expect(f.calls).toEqual(["reset", "perspective", "coordinates"]);
    expect(f.getView()).toMatchObject({ xMin: -8, yMin: -5, invXscale: 0.02, invYscale: 0.02 });
  });

  for (const missing of ["getViewProperties", "setCoordSystem"]) {
    test(`does not clear when ${missing} is unavailable`, async () => {
      const f = fixture();
      delete f.api[missing];
      await expect(f.controller.executeTool("resetCanvas", {})).rejects.toThrow();
      expect(f.calls).not.toContain("reset");
      expect(f.getObjects()).toEqual(["A"]);
    });
  }

  for (const raw of ["invalid json", "null", '{"width":0,"height":600}', '{"width":1000,"height":-1}', '{"width":"1000","height":600}']) {
    test(`rejects invalid viewport ${raw} before clearing`, async () => {
      const f = fixture();
      f.api.getViewProperties = () => raw;
      await expect(f.controller.executeTool("resetCanvas", {})).rejects.toThrow();
      expect(f.calls).not.toContain("reset");
      expect(f.getObjects()).toEqual(["A"]);
    });
  }

  for (const behavior of ["throws", "rejects", "ignores"]) {
    test(`rolls back clearing if coordinate update ${behavior}`, async () => {
      const f = fixture();
      const before = f.getView();
      f.api.setCoordSystem = () => {
        if (behavior === "throws") throw new Error("coordinates failed");
        if (behavior === "rejects") return false;
      };
      await expect(f.controller.executeTool("resetCanvas", {})).rejects.toThrow();
      expect(f.calls).toEqual(["reset", "rollback"]);
      expect(f.getObjects()).toEqual(["A"]);
      expect(f.getView()).toEqual(before);
    });
  }
});
