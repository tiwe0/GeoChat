/**
 * Ask the backend to discover models with a credential stored by the native
 * broker. The renderer never receives or reconstructs provider authentication.
 */
import {
  decodeModelDiscoveryResponse,
  type ModelDiscoveryFailureResponse
} from "@geochat-ai/app/model-discovery";

const CACHE_PREFIX = "geochatDesktopModelCatalog:";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type CachedDiscovery = { ids: string[]; fetchedAt: number };

export type DiscoveryOutcome =
  | { status: "ok"; ids: string[]; fetchedAt: number; fromCache: boolean }
  | { status: "unsupported" }
  | { status: "failed"; message: string; errorCode?: string };

function cacheKey(credentialRef: string) {
  return `${CACHE_PREFIX}${credentialRef}`;
}

function readCache(key: string): CachedDiscovery | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { ids, fetchedAt } = parsed as CachedDiscovery;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return null;
    if (typeof fetchedAt !== "number") return null;
    return { ids, fetchedAt };
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/models/modelDiscovery.ts:39", caughtError);
    return null;
  }
}

function writeCache(key: string, value: CachedDiscovery) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/models/modelDiscovery.ts:47", caughtError);
    // A full or blocked store costs freshness on the next launch, nothing more.
  }
}

export async function discoverProviderModels(input: {
  apiOrigin: string;
  authToken?: string | null;
  credentialRef: string;
  /** Skip the cache when the user asked for this explicitly. */
  force?: boolean;
}): Promise<DiscoveryOutcome> {
  const credentialRef = input.credentialRef.trim();
  if (!credentialRef) return { status: "unsupported" };

  const key = cacheKey(credentialRef);
  if (!input.force) {
    const cached = readCache(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { status: "ok", ids: cached.ids, fetchedAt: cached.fetchedAt, fromCache: true };
    }
  }

  let payload: unknown;
  let response: Response;
  try {
    response = await fetch(`${input.apiOrigin}/v1/models/discover`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.authToken ? { Authorization: `Bearer ${input.authToken}` } : {})
      },
      body: JSON.stringify({ credentialRef }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/features/models/modelDiscovery.ts:101", error);
    return { status: "failed", message: error instanceof Error ? error.message : String(error) };
  }
  try {
    payload = await response.json();
  } catch {
    return {
      status: "failed",
      message: "The provider model discovery response did not match the runtime contract.",
      errorCode: "model_discovery_response_invalid"
    };
  }

  const decoded = decodeModelDiscoveryResponse(payload);
  if (!decoded.ok) {
    return {
      status: "failed",
      message: "The provider model discovery response did not match the runtime contract.",
      errorCode: decoded.errorCode
    };
  }
  if (!("ids" in decoded.value)) return discoveryFailureOutcome(decoded.value, response.status);
  const ids = decoded.value.ids;
  const fetchedAt = Date.now();
  writeCache(key, { ids, fetchedAt });
  return { status: "ok", ids, fetchedAt, fromCache: false };
}

function discoveryFailureOutcome(failure: ModelDiscoveryFailureResponse, responseStatus: number): DiscoveryOutcome {
  return {
    status: "failed",
    message: failure.error === "provider_http_error" && typeof failure.status === "number"
      ? `Provider responded ${failure.status}`
      : failure.message || `HTTP ${responseStatus}`,
    errorCode: failure.error
  };
}
