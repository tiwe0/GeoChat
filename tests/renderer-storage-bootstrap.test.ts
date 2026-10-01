import { describe, expect, test } from "bun:test";
import { CONFIG_STORAGE_KEY, createDefaultDesktopConfig } from "../src/shared/desktop/desktop-config";
import { prepareRendererConfigBeforeRuntime } from "../src/renderer-react/src/renderer-storage-bootstrap";

function bootstrapPorts(events: string[]) {
  const values = new Map<string, string>();
  const configStorage = {
    get length() { return values.size; },
    clear() { values.clear(); },
    key(index: number) { return Array.from(values.keys())[index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { events.push("set"); values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
    async setItemDurable(key: string, value: string) { values.set(key, value); },
    acceptNativeValue(key: string, value: string) { events.push("accept"); values.set(key, value); },
  };
  return {
    values,
    preferences: {
      configStorage,
      flushWrites: async () => { events.push("flush"); },
    },
  };
}

describe("renderer storage bootstrap", () => {
  test("seeds and flushes the config before native credential reconciliation", async () => {
    const events: string[] = [];
    const { values, preferences } = bootstrapPorts(events);
    const configJson = JSON.stringify(createDefaultDesktopConfig());

    await prepareRendererConfigBeforeRuntime({
      reconcileProviderCredentials: async () => {
        events.push("reconcile");
        expect(values.get(CONFIG_STORAGE_KEY)).toBe(configJson);
        return { status: "ready", configJson };
      },
    }, preferences);

    expect(events).toEqual(["set", "flush", "flush", "reconcile", "accept"]);
  });

  test("fails closed when native credential recovery remains pending", async () => {
    const events: string[] = [];
    const { preferences } = bootstrapPorts(events);
    const configJson = JSON.stringify(createDefaultDesktopConfig());

    await expect(prepareRendererConfigBeforeRuntime({
      reconcileProviderCredentials: async () => ({
        status: "pending",
        operationId: "pending-operation",
        configJson,
      }),
    }, preferences)).rejects.toThrow("pending-operation");

    expect(events.at(-1)).toBe("accept");
  });
});
