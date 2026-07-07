const CACHE_DB_NAME = "geochat-problem-bank-cache";
const JSON_CACHE_STORE_NAME = "cloud-json";
const MEDIA_CACHE_STORE_NAME = "cloud-media";
const CACHE_DB_VERSION = 2;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

type CachedJsonResponse = {
  url: string;
  bodyText: string;
  byteSize: number;
  createdAt: number;
  accessedAt: number;
};

type CachedMediaResponse = {
  url: string;
  blob: Blob;
  byteSize: number;
  contentType: string;
  createdAt: number;
  accessedAt: number;
};

type CachedRowMetadata = {
  storeName: typeof JSON_CACHE_STORE_NAME | typeof MEDIA_CACHE_STORE_NAME;
  url: string;
  byteSize: number;
  accessedAt: number;
};

let dbPromise: Promise<IDBDatabase | undefined> | undefined;

export async function readCachedCloudProblemJson<T>(url: string): Promise<T | undefined> {
  const db = await openCacheDb();
  if (!db) return undefined;
  const row = await idbRequest<CachedJsonResponse | undefined>(
    db.transaction(JSON_CACHE_STORE_NAME, "readonly").objectStore(JSON_CACHE_STORE_NAME).get(url)
  );
  if (!row) return undefined;
  void touchCachedCloudProblemJson(db, url).catch(() => undefined);
  try {
    return JSON.parse(row.bodyText) as T;
  } catch {
    void deleteCachedCloudProblemJson(db, url).catch(() => undefined);
    return undefined;
  }
}

export async function writeCachedCloudProblemJson(url: string, value: unknown): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  const bodyText = JSON.stringify(value);
  const byteSize = new TextEncoder().encode(bodyText).byteLength;
  const maxBytes = maxCacheBytes();
  if (byteSize > maxBytes) {
    await deleteCachedCloudProblemJson(db, url);
    return;
  }

  const now = Date.now();
  await idbTransactionDone(transactionWithStore(db, JSON_CACHE_STORE_NAME, "readwrite", (store) => {
    store.put({ url, bodyText, byteSize, createdAt: now, accessedAt: now } satisfies CachedJsonResponse);
  }));
  await pruneProblemBankCache(db, maxBytes);
}

export async function readCachedCloudProblemMedia(url: string): Promise<Blob | undefined> {
  const db = await openCacheDb();
  if (!db) return undefined;
  const row = await idbRequest<CachedMediaResponse | undefined>(
    db.transaction(MEDIA_CACHE_STORE_NAME, "readonly").objectStore(MEDIA_CACHE_STORE_NAME).get(url)
  );
  if (!row) return undefined;
  void touchCachedCloudProblemMedia(db, url).catch(() => undefined);
  return row.blob;
}

export async function writeCachedCloudProblemMedia(url: string, blob: Blob): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  const byteSize = blob.size;
  const maxBytes = maxCacheBytes();
  if (byteSize > maxBytes) {
    await deleteCachedCloudProblemMedia(db, url);
    return;
  }

  const now = Date.now();
  await idbTransactionDone(transactionWithStore(db, MEDIA_CACHE_STORE_NAME, "readwrite", (store) => {
    store.put({
      url,
      blob,
      byteSize,
      contentType: blob.type,
      createdAt: now,
      accessedAt: now
    } satisfies CachedMediaResponse);
  }));
  await pruneProblemBankCache(db, maxBytes);
}

async function touchCachedCloudProblemJson(db: IDBDatabase, url: string) {
  const transaction = db.transaction(JSON_CACHE_STORE_NAME, "readwrite");
  const store = transaction.objectStore(JSON_CACHE_STORE_NAME);
  const row = await idbRequest<CachedJsonResponse | undefined>(store.get(url));
  if (row) store.put({ ...row, accessedAt: Date.now() } satisfies CachedJsonResponse);
  await idbTransactionDone(transaction);
}

async function deleteCachedCloudProblemJson(db: IDBDatabase, url: string) {
  await idbTransactionDone(transactionWithStore(db, JSON_CACHE_STORE_NAME, "readwrite", (store) => {
    store.delete(url);
  }));
}

async function touchCachedCloudProblemMedia(db: IDBDatabase, url: string) {
  const transaction = db.transaction(MEDIA_CACHE_STORE_NAME, "readwrite");
  const store = transaction.objectStore(MEDIA_CACHE_STORE_NAME);
  const row = await idbRequest<CachedMediaResponse | undefined>(store.get(url));
  if (row) store.put({ ...row, accessedAt: Date.now() } satisfies CachedMediaResponse);
  await idbTransactionDone(transaction);
}

async function deleteCachedCloudProblemMedia(db: IDBDatabase, url: string) {
  await idbTransactionDone(transactionWithStore(db, MEDIA_CACHE_STORE_NAME, "readwrite", (store) => {
    store.delete(url);
  }));
}

async function pruneProblemBankCache(db: IDBDatabase, maxBytes: number) {
  const transaction = db.transaction([JSON_CACHE_STORE_NAME, MEDIA_CACHE_STORE_NAME], "readwrite");
  const jsonStore = transaction.objectStore(JSON_CACHE_STORE_NAME);
  const mediaStore = transaction.objectStore(MEDIA_CACHE_STORE_NAME);
  const jsonRows = await idbRequest<CachedJsonResponse[]>(jsonStore.getAll());
  const mediaRows = await idbRequest<CachedMediaResponse[]>(mediaStore.getAll());
  const rows: CachedRowMetadata[] = [
    ...jsonRows.map((row): CachedRowMetadata => ({ storeName: JSON_CACHE_STORE_NAME, url: row.url, byteSize: row.byteSize, accessedAt: row.accessedAt })),
    ...mediaRows.map((row): CachedRowMetadata => ({ storeName: MEDIA_CACHE_STORE_NAME, url: row.url, byteSize: row.byteSize, accessedAt: row.accessedAt }))
  ];
  let total = rows.reduce((sum, row) => sum + row.byteSize, 0);
  for (const row of rows.sort((a, b) => a.accessedAt - b.accessedAt)) {
    if (total <= maxBytes) break;
    transaction.objectStore(row.storeName).delete(row.url);
    total -= row.byteSize;
  }
  await idbTransactionDone(transaction);
}

function transactionWithStore(
  db: IDBDatabase,
  storeName: typeof JSON_CACHE_STORE_NAME | typeof MEDIA_CACHE_STORE_NAME,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => void
) {
  const transaction = db.transaction(storeName, mode);
  callback(transaction.objectStore(storeName));
  return transaction;
}

function openCacheDb(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  dbPromise ??= new Promise((resolve) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(JSON_CACHE_STORE_NAME)) {
        db.createObjectStore(JSON_CACHE_STORE_NAME, { keyPath: "url" });
      }
      if (!db.objectStoreNames.contains(MEDIA_CACHE_STORE_NAME)) {
        db.createObjectStore(MEDIA_CACHE_STORE_NAME, { keyPath: "url" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
  return dbPromise;
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function idbTransactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function maxCacheBytes() {
  const configured = Number(import.meta.env.VITE_GEOCHAT_PROBLEM_BANK_CACHE_BYTES);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MAX_BYTES;
  return Math.floor(configured);
}
