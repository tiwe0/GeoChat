import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";

const consumers = [
  "src/renderer-react/src/features/agent-run/toolWorker.ts",
  "src/renderer-react/src/features/geogebra/choiceScenario.ts",
  "src/renderer-react/src/features/conversations/replay.ts",
  "src/renderer-react/src/features/desktop/mcpDebugActions.ts",
];

test("non-React GeoGebra consumers receive a runtime port instead of reading module state", () => {
  for (const file of consumers) {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain("getFrontendGeoGebraController");
    expect(source).not.toContain("setFrontendGeoGebraController");
  }
});

test("the GeoGebra runtime boundary has no mutable controller singleton", () => {
  const source = readFileSync("src/renderer-react/src/geogebra/runtime.ts", "utf8");
  expect(source).not.toMatch(/let\s+controller\b/);
  expect(source).not.toContain("setFrontendGeoGebraController");
  expect(source).not.toContain("getFrontendGeoGebraController");
});

test("App owns one controller and provides that same runtime to the React tree", () => {
  const source = readFileSync("src/renderer-react/src/App.tsx", "utf8");
  expect(source.match(/new GeoGebraController\(\)/g)).toHaveLength(1);
  expect(source).toContain("<GeoGebraRuntimeProvider runtime={controllerRef.current}>");
  expect(source).toContain("mountAbort.abort()");
  expect(source).toContain("mountedApplet?.dispose()");
  expect(source).toContain("controllerRef.current.setApi(null)");
});
