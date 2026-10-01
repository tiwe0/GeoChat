import type { GeoChatDesktopApi } from "../../../shared/desktop-api";

type RendererStorageApi = Pick<GeoChatDesktopApi, "getRendererStorage" | "removeRendererStorage" | "setRendererStorage">;

export const RENDERER_STORAGE_WRITE_ERROR_EVENT = "geochat:renderer-storage-write-error";

export type RendererStorageWriteErrorDetail = Readonly<{
  operation: "set" | "remove";
  keys: readonly string[];
  error: unknown;
}>;

export type NativeConfigStorage = Storage & {
  setItemDurable(key: string, value: string): Promise<void>;
};

export type NativePreferenceSchema = {
  geogebraCopilotInstallationId: string;
  geogebraCopilotLanguage: "en" | "zh-CN";
  geochatSelectedModel: string;
  geogebraCopilotThinkingEnabled: boolean;
  geogebraCopilotThinkingEffort: "light" | "standard" | "extended";
  geogebraCopilotOnboardingTourCompleted: number;
  geogebraCopilotPanelWindow: {
    version: number;
    left: number;
    top: number;
    width?: number;
    height?: number;
  };
};

export type NativePreferences = Readonly<{
  configStorage: NativeConfigStorage;
  flushWrites(): Promise<void>;
  get<Key extends keyof NativePreferenceSchema>(key: Key): NativePreferenceSchema[Key] | undefined;
  set<Key extends keyof NativePreferenceSchema>(key: Key, value: NativePreferenceSchema[Key]): Promise<void>;
  remove(key: keyof NativePreferenceSchema): Promise<void>;
}>;

let installedPreferences: NativePreferences | null = null;

function encodeValue(value: unknown) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("Renderer preference values must be JSON serializable");
  return encoded;
}

function decodeValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function reportAsyncStorageError(detail: RendererStorageWriteErrorDetail) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof Event === "undefined") return;
  const event = typeof CustomEvent === "undefined"
    ? Object.assign(new Event(RENDERER_STORAGE_WRITE_ERROR_EVENT), { detail })
    : new CustomEvent<RendererStorageWriteErrorDetail>(RENDERER_STORAGE_WRITE_ERROR_EVENT, { detail });
  globalThis.dispatchEvent(event);
}

export async function installNativePreferences(api: RendererStorageApi): Promise<NativePreferences> {
  const stored = await api.getRendererStorage();
  const mirror = new Map(
    Object.entries(stored).map(([key, value]) => [key, typeof value === "string" ? value : encodeValue(value)]),
  );
  let writeQueue: Promise<void> = Promise.resolve();
  let pendingWriteError: unknown;

  const enqueue = (operation: () => Promise<void>, reportToFlush: boolean) => {
    const result = writeQueue.then(operation);
    writeQueue = result.catch((error) => {
      if (reportToFlush) pendingWriteError ??= error;
    });
    return result;
  };
  const setRaw = (key: string, raw: string, reportToFlush: boolean) => enqueue(async () => {
    await api.setRendererStorage({ [key]: raw });
    mirror.set(key, raw);
  }, reportToFlush);
  const removeRaw = (key: string, reportToFlush: boolean) => enqueue(async () => {
    await api.removeRendererStorage([key]);
    mirror.delete(key);
  }, reportToFlush);

  const configStorage: NativeConfigStorage = {
    get length() { return mirror.size; },
    getItem: (key) => mirror.get(String(key)) ?? null,
    key: (index) => Array.from(mirror.keys())[index] ?? null,
    setItem(key, value) {
      const normalizedKey = String(key);
      void setRaw(normalizedKey, String(value), true).catch((error) => {
        reportAsyncStorageError({ operation: "set", keys: [normalizedKey], error });
      });
    },
    setItemDurable(key, value) {
      return setRaw(String(key), String(value), false);
    },
    removeItem(key) {
      const normalizedKey = String(key);
      void removeRaw(normalizedKey, true).catch((error) => {
        reportAsyncStorageError({ operation: "remove", keys: [normalizedKey], error });
      });
    },
    clear() {
      for (const key of mirror.keys()) configStorage.removeItem(key);
    },
  };

  const preferences: NativePreferences = {
    configStorage,
    async flushWrites() {
      await writeQueue;
      if (pendingWriteError !== undefined) {
        const error = pendingWriteError;
        pendingWriteError = undefined;
        throw error;
      }
    },
    get<Key extends keyof NativePreferenceSchema>(key: Key) {
      const raw = mirror.get(key);
      return raw === undefined ? undefined : decodeValue(raw) as NativePreferenceSchema[Key];
    },
    set(key, value) {
      return setRaw(key, encodeValue(value), false);
    },
    remove(key) {
      return removeRaw(key, false);
    },
  };
  installedPreferences = preferences;
  return preferences;
}

export function nativePreferences(): NativePreferences {
  if (!installedPreferences) throw new Error("Native renderer preferences have not been installed");
  return installedPreferences;
}
