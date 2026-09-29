import { createAlibaba } from "@ai-sdk/alibaba";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createProviderRegistry, customProvider, type LanguageModel } from "ai";
import type { AgentModelConfig, AgentModelProtocol } from "@geochat-ai/app/models";
import {
  CredentialResolutionError,
  type CredentialResolver,
  type ResolvedCredentialEnvelope,
} from "../credentials/resolver";

const SDK_CREDENTIAL_PLACEHOLDER = "credential-resolved-per-request";
const AUTH_QUERY_PARAMETERS = ["key", "api_key", "apiKey", "access_token"] as const;

type TrustedCredentialBinding = Readonly<Pick<
  ResolvedCredentialEnvelope,
  "schemaVersion" | "provider" | "protocol" | "canonicalBaseUrl"
>>;

export type BackendLanguageModelOptions = {
  abortSignal?: AbortSignal;
  fetchImplementation?: typeof fetch;
};

export async function createBackendLanguageModel(
  config: AgentModelConfig,
  credentialResolver: CredentialResolver,
  options: BackendLanguageModelOptions = {},
): Promise<LanguageModel> {
  const resolved = await credentialResolver.resolve(config.credentialRef, options.abortSignal);
  validateRequestedBinding(config, resolved);
  const binding = trustedBinding(resolved);
  const secureFetch = createCredentialBoundFetch({
    credentialRef: config.credentialRef,
    credentialResolver,
    binding,
    fetchImplementation: options.fetchImplementation,
    abortSignal: options.abortSignal,
  });
  const registry = createProviderRegistry({
    configured: customProvider({
      languageModels: {
        [config.model]: configuredLanguageModel(config.model, binding, secureFetch),
      },
    }),
  });
  return registry.languageModel(`configured:${config.model}`);
}

export function createCredentialBoundFetch(input: {
  credentialRef: string;
  credentialResolver: CredentialResolver;
  binding: TrustedCredentialBinding;
  fetchImplementation?: typeof fetch;
  abortSignal?: AbortSignal;
}): typeof fetch {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  return (async (requestInput: string | URL | Request, requestInit?: RequestInit) => {
    const requested = requestInput instanceof Request
      ? new Request(requestInput, requestInit)
      : new Request(requestInput.toString(), requestInit);
    const destination = validateProviderDestination(requested.url, input.binding.canonicalBaseUrl);
    const signal = requestInit?.signal
      ?? (requestInput instanceof Request ? requestInput.signal : input.abortSignal);

    // Resolve immediately before the network call. The closure retains only the
    // immutable, non-secret binding; deletion and rotation therefore take effect
    // for every retry, stream, and subsequent model step.
    const current = await input.credentialResolver.resolve(input.credentialRef, signal ?? undefined);
    validateImmutableBinding(input.binding, current);

    const headers = authenticatedHeaders(requested.headers, input.binding.protocol, current.secret);
    removeAuthenticationQuery(destination);
    const secured = new Request(destination.toString(), {
      method: requested.method,
      headers,
      body: requested.body,
      redirect: "error",
      signal: signal ?? undefined,
      ...(requested.body ? { duplex: "half" } : {}),
    } as RequestInit);
    return fetchImplementation(secured);
  }) as typeof fetch;
}

function configuredLanguageModel(
  model: string,
  binding: TrustedCredentialBinding,
  secureFetch: typeof fetch,
): LanguageModel {
  const options = {
    apiKey: SDK_CREDENTIAL_PLACEHOLDER,
    baseURL: providerSdkBaseUrl(binding),
    fetch: secureFetch,
  };

  if (binding.provider === "openai" && binding.protocol === "openai-compatible") {
    return createOpenAI(options)(model as never);
  }
  if (binding.provider === "openrouter" && binding.protocol === "openai-compatible") {
    return createOpenRouter({ ...options, appName: "GeoChat" }).chat(model as never);
  }
  if (binding.provider === "qwen" && binding.protocol === "openai-compatible") {
    return createAlibaba(options)(model as never);
  }
  if (binding.provider === "anthropic" && binding.protocol === "anthropic") {
    return createAnthropic(options)(model as never);
  }
  if (binding.provider === "google" && binding.protocol === "google") {
    return createGoogleGenerativeAI(options)(model as never);
  }
  if (binding.provider === "deepseek" && binding.protocol === "openai-compatible") {
    return createDeepSeek(options)(model as never);
  }
  if (binding.protocol === "openai-compatible") {
    return createOpenAI(options).chat(model as never);
  }
  if (binding.protocol === "anthropic") {
    return createAnthropic(options)(model as never);
  }
  if (binding.protocol === "google") {
    return createGoogleGenerativeAI(options)(model as never);
  }
  throw credentialBindingError("credential_protocol_unsupported", "The saved credential protocol is unsupported.");
}

function providerSdkBaseUrl(binding: TrustedCredentialBinding) {
  return binding.canonicalBaseUrl.replace(/\/+$/, "");
}

function validateRequestedBinding(config: AgentModelConfig, resolved: ResolvedCredentialEnvelope) {
  const requestedProtocol = config.protocol ?? defaultProtocol(config.provider);
  if (config.provider !== resolved.provider || requestedProtocol !== resolved.protocol) {
    throw credentialBindingError(
      "credential_binding_mismatch",
      "The saved credential does not match the requested model provider.",
    );
  }
}

function defaultProtocol(provider: string): AgentModelProtocol {
  if (provider === "anthropic") return "anthropic";
  if (provider === "google") return "google";
  return "openai-compatible";
}

function trustedBinding(resolved: ResolvedCredentialEnvelope): TrustedCredentialBinding {
  return Object.freeze({
    schemaVersion: resolved.schemaVersion,
    provider: resolved.provider,
    protocol: resolved.protocol,
    canonicalBaseUrl: resolved.canonicalBaseUrl,
  });
}

function validateImmutableBinding(binding: TrustedCredentialBinding, current: ResolvedCredentialEnvelope) {
  if (
    current.schemaVersion !== binding.schemaVersion
    || current.provider !== binding.provider
    || current.protocol !== binding.protocol
    || current.canonicalBaseUrl !== binding.canonicalBaseUrl
  ) {
    throw credentialBindingError(
      "credential_binding_changed",
      "The saved credential binding changed while the model request was in progress.",
    );
  }
}

function validateProviderDestination(value: string, canonicalBaseUrl: string) {
  const destination = new URL(value);
  const base = new URL(canonicalBaseUrl);
  if (destination.username || destination.password || destination.origin !== base.origin) {
    throw credentialBindingError("credential_destination_blocked", "The provider request destination is not allowed.");
  }
  const basePath = normalizedPath(base.pathname);
  const destinationPath = normalizedPath(destination.pathname);
  if (basePath !== "/" && destinationPath !== basePath && !destinationPath.startsWith(`${basePath}/`)) {
    throw credentialBindingError("credential_destination_blocked", "The provider request destination is not allowed.");
  }
  return destination;
}

function normalizedPath(pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw credentialBindingError("credential_destination_blocked", "The provider request destination is not allowed.");
  }
  const normalized = new URL(decoded, "https://provider.invalid").pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function authenticatedHeaders(source: Headers, protocol: AgentModelProtocol, secret: string) {
  const headers = new Headers(source);
  headers.delete("authorization");
  headers.delete("proxy-authorization");
  headers.delete("x-api-key");
  headers.delete("x-goog-api-key");
  if (protocol === "anthropic") {
    headers.set("x-api-key", secret);
    headers.set("anthropic-version", "2023-06-01");
  } else if (protocol === "google") {
    headers.set("x-goog-api-key", secret);
  } else {
    headers.set("authorization", `Bearer ${secret}`);
  }
  return headers;
}

function removeAuthenticationQuery(url: URL) {
  for (const parameter of AUTH_QUERY_PARAMETERS) url.searchParams.delete(parameter);
}

function credentialBindingError(code: string, message: string) {
  return new CredentialResolutionError(code, message, 409);
}
