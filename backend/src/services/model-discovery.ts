import {
  agentModelListRequest,
  decodeModelDiscoveryRequest,
  parseAgentModelListResponse
} from "@geochat-ai/app/model-discovery";
import {
  CredentialResolutionError,
  type CredentialResolver
} from "../credentials/resolver";
import { sanitizeProviderError } from "../agent/provider-error";
import {
  ProviderResponseReadError,
  ProviderResponseTooLargeError,
  readBoundedProviderResponseBody
} from "./provider-proxy";

const MODEL_DISCOVERY_TIMEOUT_MS = 15_000;

export type ModelDiscoveryLimits = {
  maxProviderResponseBodyBytes: number;
};

export type ModelDiscoveryResult = {
  httpStatus: number;
  body: unknown;
};

export type ModelDiscoveryRuntime = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  downstreamSignal?: AbortSignal;
};

export async function discoverCredentialModels(
  payload: unknown,
  credentials: CredentialResolver,
  limits: ModelDiscoveryLimits,
  runtime: ModelDiscoveryRuntime = {}
): Promise<ModelDiscoveryResult> {
  const decoded = decodeModelDiscoveryRequest(payload);
  if (!decoded.ok) {
    return result(400, {
      error: "invalid_request",
      errorCode: decoded.errorCode,
      message: "Model discovery requires exactly one credentialRef."
    });
  }
  const request = decoded.value;

  let credential;
  try {
    credential = await credentials.resolve(request.credentialRef, runtime.downstreamSignal);
  } catch (error) {
    if (error instanceof CredentialResolutionError) {
      return result(error.status, { error: error.code, message: error.message });
    }
    console.error(`[ERROR] Credential resolution failed during model discovery: ${sanitizeProviderError(error)}`);
    return result(502, {
      error: "credential_resolution_failed",
      message: "The saved credential could not be resolved."
    });
  }

  const providerRequest = agentModelListRequest({
    provider: credential.provider,
    secret: credential.secret,
    canonicalBaseUrl: credential.canonicalBaseUrl,
    protocol: credential.protocol
  });
  if (!providerRequest) {
    return result(400, {
      error: "model_discovery_unsupported",
      message: "The saved credential does not support model discovery."
    });
  }

  const abortController = new AbortController();
  let timedOut = false;
  let downstreamAborted = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort(new DOMException("Model discovery timed out.", "TimeoutError"));
  }, runtime.timeoutMs ?? MODEL_DISCOVERY_TIMEOUT_MS);
  const abortFromDownstream = () => {
    downstreamAborted = true;
    clearTimeout(timeout);
    abortController.abort(runtime.downstreamSignal?.reason ?? new DOMException("Downstream request aborted.", "AbortError"));
  };
  const cleanup = () => {
    clearTimeout(timeout);
    runtime.downstreamSignal?.removeEventListener("abort", abortFromDownstream);
  };
  if (runtime.downstreamSignal?.aborted) abortFromDownstream();
  else runtime.downstreamSignal?.addEventListener("abort", abortFromDownstream, { once: true });

  let response: Response;
  try {
    response = await (runtime.fetch ?? fetch)(providerRequest.url, {
      method: providerRequest.method,
      headers: providerRequest.headers,
      redirect: "error",
      signal: abortController.signal
    });
  } catch (error) {
    cleanup();
    if (downstreamAborted) return cancelledResult();
    if (timedOut) return timeoutResult();
    console.error(`[ERROR] Model discovery request failed provider=${credential.provider}: ${sanitizeProviderError(error)}`);
    return result(502, {
      error: "model_discovery_failed",
      message: "The provider model catalog could not be reached."
    });
  }

  let responseBody: Buffer;
  try {
    responseBody = await readBoundedProviderResponseBody(
      response,
      limits.maxProviderResponseBodyBytes,
      () => abortController.abort(new DOMException("Provider response exceeded the configured limit.", "AbortError"))
    );
  } catch (error) {
    if (error instanceof ProviderResponseTooLargeError) {
      return result(502, {
        error: "model_discovery_response_too_large",
        message: "The provider model catalog response was too large."
      });
    }
    if (downstreamAborted) return cancelledResult();
    if (timedOut) return timeoutResult();
    if (error instanceof ProviderResponseReadError) {
      console.error(`[ERROR] Model discovery response read failed provider=${credential.provider}: ${sanitizeProviderError(error.cause)}`);
    }
    return result(502, {
      error: "model_discovery_response_failed",
      message: "The provider model catalog response could not be read."
    });
  } finally {
    cleanup();
  }

  if (!response.ok) {
    return result(502, {
      error: "provider_http_error",
      message: `Provider responded with HTTP ${response.status}.`,
      status: response.status
    });
  }

  let providerPayload: unknown;
  try {
    providerPayload = JSON.parse(responseBody.toString("utf8"));
  } catch {
    return result(502, {
      error: "model_discovery_invalid_response",
      message: "The provider returned an invalid model catalog."
    });
  }

  const ids = parseAgentModelListResponse(credential.provider, providerPayload, credential.protocol);
  if (!ids.length) {
    return result(502, {
      error: "model_discovery_empty",
      message: "The provider returned no models."
    });
  }
  return result(200, { ids });
}

function cancelledResult() {
  return result(499, {
    error: "model_discovery_aborted",
    message: "Model discovery was cancelled by the downstream client."
  });
}

function timeoutResult() {
  return result(504, {
    error: "model_discovery_timeout",
    message: "Model discovery timed out."
  });
}

function result(httpStatus: number, body: unknown): ModelDiscoveryResult {
  return { httpStatus, body };
}
