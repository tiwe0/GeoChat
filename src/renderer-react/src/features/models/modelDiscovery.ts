/**
 * Ask the backend to discover models with a credential stored by the native
 * broker. The renderer never receives or reconstructs provider authentication.
 */
import {
  decodeModelDiscoveryResponse,
  type ModelDiscoveryFailureResponse
} from "@geochat-ai/app/model-discovery";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import {
  CORRELATION_ID_HEADER,
  createCorrelationId
} from "@geochat-ai/app/request-correlation";

const logger = createStructuredLogger("models.discovery");

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const discoveryCache = new Map<string, CachedDiscovery>();

type CachedDiscovery = { ids: string[]; fetchedAt: number };

export type DiscoveryOutcome =
  | { status: "ok"; ids: string[]; fetchedAt: number; fromCache: boolean }
  | { status: "unsupported" }
  | { status: "failed"; message: string; errorCode?: string };

function cacheKey(credentialRef: string) {
  return credentialRef;
}

async function readCache(key: string): Promise<CachedDiscovery | null> {
  return discoveryCache.get(key) ?? null;
}

async function writeCache(key: string, value: CachedDiscovery) {
  discoveryCache.set(key, value);
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
    const cached = await readCache(key);
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
        [CORRELATION_ID_HEADER]: createCorrelationId("model-discovery"),
        ...(input.authToken ? { Authorization: `Bearer ${input.authToken}` } : {})
      },
      body: JSON.stringify({ credentialRef }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    logger.warn("request_failed", "MODEL_DISCOVERY_REQUEST_FAILED", { error });
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
  await writeCache(key, { ids, fetchedAt });
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
