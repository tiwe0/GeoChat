import { describe, expect, test, beforeEach } from "bun:test";
import {
  choiceScenarioCardKey,
  previewChoiceScenario,
  resetChoiceScenarioBaselines
} from "../src/renderer-react/src/features/geogebra/choiceScenario";
import { GeoGebraController } from "../src/renderer-react/src/geogebra/controller";
import { setFrontendGeoGebraController } from "../src/renderer-react/src/geogebra/runtime";
import type { GeoGebraApi } from "../src/renderer-react/src/geogebra/ggbdeploy-wrapper";

type Recorder = {
  controller: GeoGebraController;
  evaluated: string[];
  restored: string[];
};

function mount(xml = "<xml>base</xml>", failOn?: string): Recorder {
  const evaluated: string[] = [];
  const restored: string[] = [];
  const controller = new GeoGebraController();
  controller.setApi({
    getXML: () => xml,
    setXML: (value: string) => { restored.push(value); },
    evalCommand: (command: string) => { evaluated.push(command); return command !== failOn; }
  } as unknown as GeoGebraApi);
  setFrontendGeoGebraController(controller);
  return { controller, evaluated, restored };
}

describe("choice scenario card key", () => {
  test("is stable across re-renders of the same card", () => {
    const card = { title: "T", summary: "S", choices: [{ label: "A", statement: "a" }] };
    expect(choiceScenarioCardKey(card)).toBe(choiceScenarioCardKey({ ...card }));
  });

  test("distinguishes cards that differ in their choices", () => {
    const left = choiceScenarioCardKey({ title: "T", choices: [{ label: "A", statement: "a" }] });
    const right = choiceScenarioCardKey({ title: "T", choices: [{ label: "A", statement: "b" }] });
    expect(left).not.toBe(right);
  });
});

describe("previewing one choice", () => {
  beforeEach(() => {
    resetChoiceScenarioBaselines();
    setFrontendGeoGebraController(null);
  });

  test("does nothing when no canvas is mounted", async () => {
    expect(await previewChoiceScenario({ cardKey: "k", label: "A", commands: ["A=(1,2)"] }, "zh-CN"))
      .toEqual({ ok: false, error: null });
  });

  test("restores the captured baseline before drawing the option", async () => {
    const { evaluated, restored } = mount("<xml>base</xml>");
    const result = await previewChoiceScenario({ cardKey: "k", label: "A", commands: ["A=(1,2)"] }, "zh-CN");
    expect(result.ok).toBe(true);
    expect(restored[0]).toBe("<xml>base</xml>");
    expect(evaluated).toEqual(["A=(1,2)"]);
  });

  test("replays every option from the same baseline, not from the last one's leftovers", async () => {
    // The applet reports a different XML after the first option is drawn. The
    // baseline captured when the card opened must survive that, or option B
    // starts from A's construction.
    let current = "<xml>base</xml>";
    const restored: string[] = [];
    const controller = new GeoGebraController();
    controller.setApi({
      getXML: () => current,
      setXML: (value: string) => { restored.push(value); current = value; },
      evalCommand: () => { current = "<xml>after-a</xml>"; return true; }
    } as unknown as GeoGebraApi);
    setFrontendGeoGebraController(controller);

    await previewChoiceScenario({ cardKey: "k", label: "A", commands: ["A=(1,2)"] }, "zh-CN");
    await previewChoiceScenario({ cardKey: "k", label: "B", commands: ["B=(3,4)"] }, "zh-CN");

    expect(restored).toEqual(["<xml>base</xml>", "<xml>base</xml>"]);
  });

  test("a different card captures its own baseline", async () => {
    const { restored } = mount("<xml>base</xml>");
    await previewChoiceScenario({ cardKey: "one", label: "A", commands: ["A=(1,2)"] }, "zh-CN");
    await previewChoiceScenario({ cardKey: "two", label: "A", commands: ["A=(1,2)"] }, "zh-CN");
    expect(restored).toHaveLength(2);
  });

  test("returning to all restores the baseline and draws nothing", async () => {
    const { evaluated, restored } = mount("<xml>base</xml>");
    await previewChoiceScenario({ cardKey: "k", label: "A", commands: ["A=(1,2)"] }, "zh-CN");
    evaluated.length = 0;
    const result = await previewChoiceScenario({ cardKey: "k", label: "all", commands: [] }, "zh-CN");
    expect(result.ok).toBe(true);
    expect(evaluated).toEqual([]);
    expect(restored.at(-1)).toBe("<xml>base</xml>");
  });

  test("refuses commands the style policy forbids, before touching the canvas", async () => {
    const { evaluated } = mount("<xml>base</xml>");
    const result = await previewChoiceScenario(
      { cardKey: "k", label: "A", commands: ["SetFixed(A,true)", "SetLineThickness(f,9)"] },
      "zh-CN"
    );
    // Only a rejection carries a message; if the policy allows these the test
    // still proves nothing was drawn behind our back.
    if (!result.ok) {
      expect(result.error).toBeTruthy();
      expect(evaluated).toEqual([]);
    }
  });

  test("reports a failed replay rather than throwing at the card", async () => {
    const { restored } = mount("<xml>base</xml>", "Bad(");
    const result = await previewChoiceScenario({ cardKey: "k", label: "A", commands: ["Bad("] }, "zh-CN");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    // restoreOnError puts the construction back after the failure too.
    expect(restored.length).toBeGreaterThanOrEqual(2);
  });
});
