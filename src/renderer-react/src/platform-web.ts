/** Small Web adapter for Web features that persist state through browser.storage. */
export type WebStorageArea = {
  get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

function storageArea(): WebStorageArea {
  return {
    async get(keys) {
      const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : keys ? Object.keys(keys) : null;
      if (!names) return { ...localStorage };
      return Object.fromEntries(names.map((key) => [key, readValue(key)]).filter(([, value]) => value !== undefined));
    },
    async set(values) {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
    },
    async remove(keys) {
      for (const key of (Array.isArray(keys) ? keys : [keys])) localStorage.removeItem(key);
    },
  };
}

function readValue(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { return raw; }
}

export function installWebPlatform() {
  const current = (globalThis as { browser?: unknown }).browser;
  if (current) return;
  const storage = storageArea();
  (globalThis as { browser?: unknown }).browser = {
    storage: { local: storage },
    runtime: {
      async sendMessage(message: unknown) {
        // Native extension messages have no desktop equivalent. GeoChat
        // runs its tools in-process and exposes no native-host surface.
        void message;
        return undefined;
      },
    },
  };
}
