import {
  agentModelListRequest,
  parseAgentModelListResponse
} from "@geochat-ai/app/model-discovery";

/**
 * Ask a provider what it currently serves, through the backend's proxy.
 *
 * The request never leaves the machine directly: /v1/provider-fetch already
 * exists for exactly this shape of call and enforces a host allowlist, so the
 * key travels to the local backend and out from there, and the renderer is not
 * making cross-origin calls to provider APIs from a webview.
 */
const CACHE_PREFIX = "geochatDesktopModelCatalog:";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type CachedDiscovery = { ids: string[]; fetchedAt: number };

export type DiscoveryOutcome =
  | { status: "ok"; ids: string[]; fetchedAt: number; fromCache: boolean }
  | { status: "unsupported" }
  | { status: "failed"; message: string };

function cacheKey(provider: string, baseUrl: string) {
  return `${CACHE_PREFIX}${provider}:${baseUrl}`;
}

function readCache(key: string): CachedDiscovery | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { ids, fetchedAt } = parsed as CachedDiscovery;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return null;
    if (typeof fetchedAt !== "number") return null;
    return { ids, fetchedAt };
  } catch {
    return null;
  }
}

function writeCache(key: string, value: CachedDiscovery) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store costs freshness on the next launch, nothing more.
  }
}

export async function discoverProviderModels(input: {
  apiOrigin: string;
  provider: string;
  apiKey: string;
  customBaseUrl?: string;
  /** Skip the cache when the user asked for this explicitly. */
  force?: boolean;
}): Promise<DiscoveryOutcome> {
  const request = agentModelListRequest({
    provider: input.provider,
    apiKey: input.apiKey,
    customBaseUrl: input.customBaseUrl
  });
  if (!request) return { status: "unsupported" };

  // The key is part of the Gemini URL, so it must never reach the cache key.
  const key = cacheKey(input.provider, input.customBaseUrl?.trim() ?? "");
  if (!input.force) {
    const cached = readCache(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { status: "ok", ids: cached.ids, fetchedAt: cached.fetchedAt, fromCache: true };
    }
  }

  let payload: unknown;
  try {
    const response = await fetch(`${input.apiOrigin}/v1/provider-fetch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: input.provider,
        customBaseUrl: input.customBaseUrl,
        url: request.url,
        method: request.method,
        headers: request.headers
      }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return { status: "failed", message: `HTTP ${response.status}` };
    const proxied = await response.json() as { status?: number; bodyBase64?: string };
    if (typeof proxied.status !== "number" || proxied.status >= 400) {
      // A 401 here means the key is wrong, which the caller should say plainly
      // rather than reporting an empty catalog.
      return { status: "failed", message: `Provider responded ${proxied.status ?? "with no status"}` };
    }
    payload = JSON.parse(decodeBase64Utf8(proxied.bodyBase64 ?? ""));
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : String(error) };
  }

  const ids = parseAgentModelListResponse(input.provider, payload);
  if (!ids.length) return { status: "failed", message: "The provider returned no models." };
  const fetchedAt = Date.now();
  writeCache(key, { ids, fetchedAt });
  return { status: "ok", ids, fetchedAt, fromCache: false };
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
