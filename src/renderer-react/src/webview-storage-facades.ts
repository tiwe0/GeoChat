function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(String(key)); },
    setItem: (key, value) => { values.set(String(key), String(value)); },
  };
}

function replaceWindowStorage(name: "localStorage" | "sessionStorage", storage: Storage) {
  Object.defineProperty(globalThis, name, { configurable: true, value: storage });
  if (globalThis[name] !== storage) throw new Error(`Failed to replace WebView ${name}`);
}

function disableWebViewPersistenceApis() {
  let serviceWorker: ServiceWorkerContainer | undefined;
  try { serviceWorker = globalThis.navigator?.serviceWorker; } catch { serviceWorker = undefined; }
  if (serviceWorker) {
    Object.defineProperty(serviceWorker, "register", {
      configurable: true,
      value: async () => { throw new Error("WebView service-worker persistence is disabled"); },
    });
  }

  let storageManager: (StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> }) | undefined;
  try { storageManager = globalThis.navigator?.storage; } catch { storageManager = undefined; }
  if (storageManager?.getDirectory) {
    Object.defineProperty(storageManager, "getDirectory", {
      configurable: true,
      value: async () => { throw new Error("WebView origin-private file storage is disabled"); },
    });
  }

  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
  Object.defineProperty(globalThis, "caches", { configurable: true, value: undefined });
}

/**
 * Third-party code may assume Web Storage exists, but no WebView-owned state is
 * durable. Application configuration uses the native renderer repository and
 * conversations use the local SQLite backend.
 */
export async function installWebViewStorageFacades() {
  replaceWindowStorage("localStorage", memoryStorage());
  replaceWindowStorage("sessionStorage", memoryStorage());
  disableWebViewPersistenceApis();
}
