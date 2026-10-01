import type { AgentModelProtocol } from "@geochat-ai/app/models";
import { normalizeCorrelationId } from "@geochat-ai/app/request-correlation";

const CREDENTIAL_BROKER_TIMEOUT_MS = 5_000;

export type ResolvedCredentialEnvelope = {
  schemaVersion: 1;
  secret: string;
  provider: string;
  protocol: AgentModelProtocol;
  canonicalBaseUrl: string;
};

export type CredentialResolver = {
  resolve(
    credentialRef: string,
    signal?: AbortSignal,
    context?: CredentialResolutionContext
  ): Promise<ResolvedCredentialEnvelope>;
};

export type CredentialResolutionContext = {
  correlationId?: string;
};

export class CredentialResolutionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "CredentialResolutionError";
    this.code = code;
    this.status = status;
  }
}

export function createCredentialResolverFromEnvironment(
  environment: Record<string, string | undefined> = Bun.env,
  fetchImplementation: typeof fetch = fetch
): CredentialResolver {
  const brokerUrl = parseBrokerUrl(environment.GEOCHAT_CREDENTIAL_BROKER_URL);
  const brokerToken = environment.GEOCHAT_CREDENTIAL_BROKER_TOKEN?.trim();

  return {
    async resolve(credentialRef, downstreamSignal, context) {
      const normalizedRef = normalizeCredentialRef(credentialRef);
      if (!brokerUrl || !brokerToken) {
        throw new CredentialResolutionError(
          "credential_broker_unavailable",
          "The native credential broker is unavailable.",
          503
        );
      }

      const timeoutController = new AbortController();
      const timeout = setTimeout(
        () => timeoutController.abort(new DOMException("Credential broker request timed out.", "TimeoutError")),
        CREDENTIAL_BROKER_TIMEOUT_MS
      );
      const abortFromDownstream = () => timeoutController.abort(downstreamSignal?.reason);
      if (downstreamSignal?.aborted) abortFromDownstream();
      else downstreamSignal?.addEventListener("abort", abortFromDownstream, { once: true });

      try {
        const correlationId = normalizeCorrelationId(context?.correlationId);
        const response = await fetchImplementation(new URL("/v1/credentials/resolve", brokerUrl), {
          method: "POST",
          headers: {
            authorization: `Bearer ${brokerToken}`,
            "cache-control": "no-store",
            "content-type": "application/json",
            ...(correlationId ? { "x-correlation-id": correlationId } : {})
          },
          body: JSON.stringify({ credentialRef: normalizedRef }),
          redirect: "error",
          signal: timeoutController.signal
        });
        const payload = await readBrokerPayload(response);
        if (!response.ok) {
          throw new CredentialResolutionError(
            typeof payload?.error === "string" ? payload.error : "credential_broker_failed",
            brokerFailureMessage(response.status),
            mapBrokerStatus(response.status)
          );
        }
        if (!isResolvedCredentialEnvelope(payload)) {
          throw new CredentialResolutionError(
            "credential_broker_invalid_response",
            "The native credential broker returned an invalid response."
          );
        }
        return payload;
      } catch (error) {
        if (error instanceof CredentialResolutionError) throw error;
        if (downstreamSignal?.aborted) {
          throw new CredentialResolutionError(
            "credential_resolution_aborted",
            "Credential resolution was cancelled.",
            499
          );
        }
        if (timeoutController.signal.aborted) {
          throw new CredentialResolutionError(
            "credential_broker_timeout",
            "The native credential broker did not respond in time.",
            504
          );
        }
        throw new CredentialResolutionError(
          "credential_broker_unavailable",
          "The native credential broker is unavailable.",
          503
        );
      } finally {
        clearTimeout(timeout);
        downstreamSignal?.removeEventListener("abort", abortFromDownstream);
      }
    }
  };
}

function normalizeCredentialRef(value: string) {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new CredentialResolutionError(
      "invalid_credential_reference",
      "The credential reference is invalid.",
      400
    );
  }
  return normalized;
}

function parseBrokerUrl(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") return undefined;
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function readBrokerPayload(response: Response) {
  try {
    const payload = await response.json() as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function isResolvedCredentialEnvelope(value: unknown): value is ResolvedCredentialEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.schemaVersion === 1 &&
    typeof payload.secret === "string" && Boolean(payload.secret.trim()) &&
    typeof payload.provider === "string" && Boolean(payload.provider.trim()) &&
    (payload.protocol === "openai-compatible" || payload.protocol === "anthropic" || payload.protocol === "google") &&
    isCanonicalProviderUrl(payload.canonicalBaseUrl)
  );
}

function isCanonicalProviderUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]";
    return (
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      (parsed.protocol === "https:" || (loopback && parsed.protocol === "http:"))
    );
  } catch {
    return false;
  }
}

function mapBrokerStatus(status: number) {
  if (status === 400) return 400;
  if (status === 404 || status === 410) return 409;
  if (status === 429) return 503;
  return 502;
}

function brokerFailureMessage(status: number) {
  if (status === 404 || status === 410) return "The saved credential is unavailable.";
  if (status === 429) return "The native credential broker is busy.";
  return "The native credential broker rejected the request.";
}
