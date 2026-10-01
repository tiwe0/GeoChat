import { describe, expect, test } from "bun:test";
import { getCanvasSessionId } from "../src/renderer-react/src/features/agent-run/canvasIdentity";

describe("canvas identity", () => {
  test("keeps one process-local identifier without consulting WebView storage", () => {
    const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new Error("sessionStorage must not be used");
      }
    });

    try {
      const first = getCanvasSessionId();
      expect(first).toBeTruthy();
      expect(getCanvasSessionId()).toBe(first);
    } finally {
      if (originalSessionStorage) Object.defineProperty(globalThis, "sessionStorage", originalSessionStorage);
      else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    }
  });
});
