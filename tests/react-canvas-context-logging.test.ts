import { expect, test } from "bun:test";
import { tryReadCanvasContext } from "../src/renderer-react/src/geogebra/canvas-context";

test("canvas context stays silent when DOMParser is unavailable", () => {
  const globalRecord = globalThis as typeof globalThis & { DOMParser?: typeof DOMParser };
  const parserDescriptor = Object.getOwnPropertyDescriptor(globalRecord, "DOMParser");
  const originalError = console.error;
  const originalDebug = console.debug;
  const output: unknown[][] = [];
  Object.defineProperty(globalRecord, "DOMParser", { configurable: true, value: undefined });
  console.error = (...messages) => { output.push(messages); };
  console.debug = (...messages) => { output.push(messages); };

  try {
    expect(tryReadCanvasContext({ getXML: () => "<geogebra/>" }, false)).toBeUndefined();
    expect(output).toEqual([]);
  } finally {
    console.error = originalError;
    console.debug = originalDebug;
    if (parserDescriptor) Object.defineProperty(globalRecord, "DOMParser", parserDescriptor);
    else Reflect.deleteProperty(globalRecord, "DOMParser");
  }
});
