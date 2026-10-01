import { describe, expect, test } from "bun:test";
import type { GeoChatDesktopApi } from "../src/shared/desktop-api";
import { installWebViewStorageFacades } from "../src/renderer-react/src/webview-storage-facades";
import {
  installNativePreferences,
  RENDERER_STORAGE_WRITE_ERROR_EVENT,
  type RendererStorageWriteErrorDetail,
} from "../src/renderer-react/src/lib/nativePreferences";
import {
  CONFIG_STORAGE_KEY,
  createDefaultDesktopConfig,
  installDesktopConfigStorage,
  persistDesktopConfig,
  readDesktopConfig,
  updateDesktopConfig,
} from "../src/shared/desktop/desktop-config";

type StorageApi = Pick<GeoChatDesktopApi, "getRendererStorage" | "removeRendererStorage" | "setRendererStorage">;

function nativeStorage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const api: StorageApi = {
    async getRendererStorage(keys) {
      const selected = keys ?? Array.from(values.keys());
      return Object.fromEntries(selected.flatMap((key) => values.has(key) ? [[key, values.get(key)]] : []));
    },
    async setRendererStorage(next) {
      for (const [key, value] of Object.entries(next)) values.set(key, value);
    },
    async removeRendererStorage(keys) {
      for (const key of keys) values.delete(key);
    },
  };
  return { api, values };
}

describe("native renderer storage adapter", () => {
  test("uses native storage with a committed facade backed by a durable write", async () => {
    const { api, values } = nativeStorage({ geogebraCopilotLanguage: JSON.stringify("zh-CN") });
    const platform = await installNativePreferences(api);

    expect(platform.get("geogebraCopilotLanguage")).toBe("zh-CN");
    await platform.set("geogebraCopilotLanguage", "en");
    await platform.set("geogebraCopilotPanelWindow", { version: 2, left: 12, top: 24 });
    expect(values.get("geogebraCopilotLanguage")).toBe(JSON.stringify("en"));
    expect(platform.get("geogebraCopilotPanelWindow")).toEqual({ version: 2, left: 12, top: 24 });

    platform.configStorage.setItem("config", "{\"schemaVersion\":3}");
    expect(platform.configStorage.getItem("config")).toBeNull();
    await platform.flushWrites();
    expect(platform.configStorage.getItem("config")).toBe("{\"schemaVersion\":3}");
    expect(values.get("config")).toBe("{\"schemaVersion\":3}");
  });

  test("serializes config mutations and never publishes a failed credential reference", async () => {
    const initial = createDefaultDesktopConfig("en-US");
    const { api, values } = nativeStorage({ [CONFIG_STORAGE_KEY]: JSON.stringify(initial) });
    const realSet = api.setRendererStorage;
    let releaseFailedCredentialWrite!: () => void;
    const failedCredentialWrite = new Promise<void>((resolve) => { releaseFailedCredentialWrite = resolve; });
    api.setRendererStorage = async (next) => {
      const rawConfig = next[CONFIG_STORAGE_KEY];
      if (typeof rawConfig === "string" && rawConfig.includes("uncommitted-ref")) {
        await failedCredentialWrite;
        throw new Error("config write failed");
      }
      await realSet(next);
    };
    const platform = await installNativePreferences(api);
    installDesktopConfigStorage(platform.configStorage, platform.flushWrites);

    const failedCredentialCommit = updateDesktopConfig((current) => ({
      ...current,
      model: { ...current.model, credentialRef: "uncommitted-ref" },
    }));
    const unrelatedSettingsCommit = updateDesktopConfig((current) => ({
      ...current,
      skills: { ...current.skills, enabled: false },
    }));
    expect(readDesktopConfig().model.credentialRef).toBe(initial.model.credentialRef);

    releaseFailedCredentialWrite();
    await expect(failedCredentialCommit).rejects.toThrow("config write failed");
    await expect(unrelatedSettingsCommit).resolves.toMatchObject({
      model: { credentialRef: initial.model.credentialRef },
      skills: { enabled: false },
    });

    const committed = JSON.parse(String(values.get(CONFIG_STORAGE_KEY)));
    expect(committed.model.credentialRef).toBe(initial.model.credentialRef);
    expect(committed.skills.enabled).toBe(false);
    expect(readDesktopConfig()).toMatchObject(committed);
  });

  test("coerces Web Storage keys and values to strings", async () => {
    const { api, values } = nativeStorage();
    const platform = await installNativePreferences(api);
    const storage = platform.configStorage as unknown as {
      setItem(key: unknown, value: unknown): void;
      getItem(key: unknown): string | null;
      removeItem(key: unknown): void;
    };

    storage.setItem(42, 7);
    await platform.flushWrites();
    expect(storage.getItem(42)).toBe("7");
    expect(values.get("42")).toBe("7");

    storage.removeItem(42);
    await platform.flushWrites();
    expect(storage.getItem(42)).toBeNull();
  });

  test("reports fire-and-forget Web Storage failures as structured events", async () => {
    const { api } = nativeStorage();
    api.setRendererStorage = async () => { throw new Error("disk full"); };
    const platform = await installNativePreferences(api);
    const failures: RendererStorageWriteErrorDetail[] = [];
    const onFailure = (event: Event) => {
      failures.push((event as Event & { detail: RendererStorageWriteErrorDetail }).detail);
    };
    globalThis.addEventListener(RENDERER_STORAGE_WRITE_ERROR_EVENT, onFailure);
    try {
      platform.configStorage.setItem("vendor-setting", "value");
      await expect(platform.flushWrites()).rejects.toThrow("disk full");
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ operation: "set", keys: ["vendor-setting"] });
      expect(failures[0]?.error).toBeInstanceOf(Error);
    } finally {
      globalThis.removeEventListener(RENDERER_STORAGE_WRITE_ERROR_EVENT, onFailure);
    }
  });

  test("does not expose an uncommitted native preference write", async () => {
    const { api } = nativeStorage({ geogebraCopilotLanguage: JSON.stringify("zh-CN") });
    api.setRendererStorage = async () => { throw new Error("disk full"); };
    const platform = await installNativePreferences(api);

    await expect(platform.set("geogebraCopilotLanguage", "en")).rejects.toThrow("disk full");
    expect(platform.get("geogebraCopilotLanguage")).toBe("zh-CN");
  });

  test("rolls back the synchronous config mirror after a native write failure and accepts a later write", async () => {
    const { api, values } = nativeStorage({ config: "old" });
    const realSet = api.setRendererStorage;
    let fail = true;
    api.setRendererStorage = async (next) => {
      if (fail) throw new Error("disk full");
      await realSet(next);
    };
    const platform = await installNativePreferences(api);

    platform.configStorage.setItem("config", "uncommitted");
    await expect(platform.flushWrites()).rejects.toThrow("disk full");
    expect(platform.configStorage.getItem("config")).toBe("old");

    fail = false;
    platform.configStorage.setItem("config", "new");
    await platform.flushWrites();
    expect(platform.configStorage.getItem("config")).toBe("new");
    expect(values.get("config")).toBe("new");
  });

  test("keeps the committed mirror after consecutive native write failures", async () => {
    const { api, values } = nativeStorage({ config: "old" });
    api.setRendererStorage = async () => { throw new Error("disk full"); };
    const platform = await installNativePreferences(api);

    platform.configStorage.setItem("config", "first");
    platform.configStorage.setItem("config", "second");
    await expect(platform.flushWrites()).rejects.toThrow("disk full");

    expect(platform.configStorage.getItem("config")).toBe("old");
    expect(values.get("config")).toBe("old");
  });

  test("does not attribute an unrelated failed write to a later config commit", async () => {
    const { api, values } = nativeStorage();
    const realSet = api.setRendererStorage;
    let failNext = true;
    api.setRendererStorage = async (next) => {
      if (failNext) {
        failNext = false;
        throw new Error("unrelated vendor write failure");
      }
      await realSet(next);
    };
    const platform = await installNativePreferences(api);
    installDesktopConfigStorage(platform.configStorage, platform.flushWrites);
    platform.configStorage.setItem("vendor-cache", "transient");

    const defaultConfig = createDefaultDesktopConfig();
    const config = {
      ...defaultConfig,
      model: { ...defaultConfig.model, credentialRef: "new-secret-ref" },
    };
    await persistDesktopConfig(config);
    expect(values.get(CONFIG_STORAGE_KEY)).toContain("new-secret-ref");
    await expect(platform.flushWrites()).rejects.toThrow("unrelated vendor write failure");
    await persistDesktopConfig(createDefaultDesktopConfig());
  });

  test("keeps a config commit independent from a later concurrent vendor failure", async () => {
    const { api, values } = nativeStorage();
    const realSet = api.setRendererStorage;
    api.setRendererStorage = async (next) => {
      if ("vendor-cache" in next) throw new Error("concurrent vendor failure");
      await realSet(next);
    };
    const platform = await installNativePreferences(api);
    installDesktopConfigStorage(platform.configStorage, platform.flushWrites);
    const defaultConfig = createDefaultDesktopConfig();
    const config = {
      ...defaultConfig,
      model: { ...defaultConfig.model, credentialRef: "new-secret-ref" },
    };

    const commit = persistDesktopConfig(config);
    platform.configStorage.setItem("vendor-cache", "too-large");

    await expect(commit).resolves.toBeUndefined();
    expect(values.get(CONFIG_STORAGE_KEY)).toContain("new-secret-ref");
    await expect(platform.flushWrites()).rejects.toThrow("concurrent vendor failure");
    await persistDesktopConfig(createDefaultDesktopConfig());
  });

  test("keeps localStorage and sessionStorage in memory instead of native persistence", async () => {
    const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    const indexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    const cachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
    const { api, values } = nativeStorage();
    const platform = await installNativePreferences(api);

    try {
      await installWebViewStorageFacades();
      globalThis.localStorage.setItem("vendor-setting", "memory-only");
      globalThis.sessionStorage.setItem("gwt-bootstrap", "memory-only");
      await platform.flushWrites();

      expect(globalThis.localStorage.getItem("vendor-setting")).toBe("memory-only");
      expect(values.has("vendor-setting")).toBe(false);
      expect(values.has("gwt-bootstrap")).toBe(false);
      expect(globalThis.sessionStorage.getItem("gwt-bootstrap")).toBe("memory-only");
      expect(globalThis.indexedDB).toBeUndefined();
      expect(globalThis.caches).toBeUndefined();
    } finally {
      if (localDescriptor) Object.defineProperty(globalThis, "localStorage", localDescriptor);
      else delete (globalThis as Partial<typeof globalThis>).localStorage;
      if (sessionDescriptor) Object.defineProperty(globalThis, "sessionStorage", sessionDescriptor);
      else delete (globalThis as Partial<typeof globalThis>).sessionStorage;
      if (indexedDbDescriptor) Object.defineProperty(globalThis, "indexedDB", indexedDbDescriptor);
      else delete (globalThis as Partial<typeof globalThis>).indexedDB;
      if (cachesDescriptor) Object.defineProperty(globalThis, "caches", cachesDescriptor);
      else delete (globalThis as Partial<typeof globalThis>).caches;
    }
  });
});
