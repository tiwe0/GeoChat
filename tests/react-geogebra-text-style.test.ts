import { describe, expect, test } from "bun:test";
import { GeoGebraController } from "../src/renderer-react/src/geogebra/controller";
import type { GeoGebraApi } from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

function fixture() {
  const calls: unknown[][] = [];
  const api: GeoGebraApi = {
    getXML: () => "<geogebra><construction/></geogebra>",
    setXML: () => { calls.push(["rollback"]); },
    exists: (name: string) => name !== "missing",
    getObjectType: (name: string) => name === "A" ? "point" : "text",
    setFont: (...args: unknown[]) => { calls.push(args); },
    getStyleXML: () => '<element type="text"><font sizeM="0.75" style="0" serif="false"/></element>',
  };
  const controller = new GeoGebraController();
  controller.setApi(api);
  return { controller, api, calls };
}

describe("text font capability", () => {
  test("uses real setFont and returns actual style XML, without calling command batches", async () => {
    const f = fixture();
    const result = await f.controller.executeTool("setTextStyle", { objects: ["caption"], fontSize: 12 });
    expect(f.calls).toEqual([["caption", 12, false, false, false]]);
    expect(result).toMatchObject({ ok: true, objects: [{ name: "caption", styleXml: expect.stringContaining('sizeM="0.75"') }] });
  });
  test("validates every object's type before applying any style", async () => {
    const f = fixture();
    await expect(f.controller.executeTool("setTextStyle", { objects: ["caption", "A"], fontSize: 12 })).rejects.toThrow("不是已有文字对象");
    expect(f.calls).toEqual([["rollback"]]);
  });
  test("missing setFont fails explicitly, rather than silently ignoring the request", async () => {
    const f = fixture();
    delete f.api.setFont;
    await expect(f.controller.executeTool("setTextStyle", { objects: ["caption"], fontSize: 12 })).rejects.toThrow("不支持");
  });
  test("rejects invalid font inputs before writes", async () => {
    for (const input of [{ fontSize: 0 }, { fontSize: 100 }, { fontSize: Number.NaN }, { fontSize: 12, bold: "yes" }]) {
      const f = fixture();
      await expect(f.controller.executeTool("setTextStyle", { objects: ["caption"], ...input })).rejects.toThrow();
      expect(f.calls).toEqual([["rollback"]]);
    }
  });
  test("style API failure rolls back the mutation", async () => {
    const f = fixture();
    f.api.setFont = () => false;
    await expect(f.controller.executeTool("setTextStyle", { objects: ["caption"], fontSize: 12 })).rejects.toThrow("拒绝");
    expect(f.calls).toEqual([["rollback"]]);
  });
});
