import {
  acceptNativeDesktopConfigCommit,
  readDesktopConfig,
  normalizeDesktopConfigJson,
} from "../../../../shared/desktop/desktop-config";
import type { DesktopConfig } from "../../../../shared/desktop/workbench-types";
import type {
  DesktopBeginProviderCredentialResult,
  DesktopCredentialLifecycleStatus,
} from "../../../../shared/desktop-api";
import { installedDesktopApi } from "../../../../shared/desktop/tauri-bridge";

const TEST_PROVIDER_NAME = "GeoChat deterministic E2E";
const TEST_CREDENTIAL_SECRET = "geochat-local-debug-e2e";

function assertDebugBuild() {
  const environment = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (environment?.DEV !== true) {
    throw new Error("The deterministic provider can only be configured in a development build.");
  }
}

function assertNonce(nonce: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce)) {
    throw new Error("A valid deterministic E2E nonce is required.");
  }
}

export async function configureDeterministicDebugProvider(baseUrl: string, model: string, nonce: string) {
  assertDebugBuild();
  const desktopApi = installedDesktopApi();
  if (!desktopApi) throw new Error("Native credential storage is unavailable.");
  return configureDeterministicDebugProviderWithPorts(baseUrl, model, nonce, {
    readConfig: readDesktopConfig,
    normalizeConfigJson: normalizeDesktopConfigJson,
    begin: (request) => desktopApi.beginProviderCredential(request),
    commit: (operationId, nextConfigJson) => desktopApi.commitProviderCredential(operationId, nextConfigJson),
    abort: (operationId) => desktopApi.abortProviderCredential(operationId),
    reconcile: () => desktopApi.reconcileProviderCredentials(),
    acceptCommittedConfig: acceptNativeDesktopConfigCommit,
  });
}

export async function configureDeterministicDebugProviderWithPorts(
  baseUrl: string,
  model: string,
  nonce: string,
  ports: {
    readConfig(): DesktopConfig;
    normalizeConfigJson(rawJson: string): DesktopConfig;
    begin(request: { provider: string; protocol: "openai-compatible"; baseUrl: string; secret: string }): Promise<DesktopBeginProviderCredentialResult>;
    commit(operationId: string, nextConfigJson: string): Promise<DesktopCredentialLifecycleStatus>;
    abort(operationId: string): Promise<DesktopCredentialLifecycleStatus>;
    reconcile(): Promise<DesktopCredentialLifecycleStatus>;
    acceptCommittedConfig(rawJson: string): void;
  },
) {
  assertNonce(nonce);
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:" || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost")) {
    throw new Error("The deterministic provider must use a loopback HTTP URL.");
  }
  if (ports.readConfig().customProvider.credentialRef) {
    throw new Error("The deterministic provider requires a profile without a configured custom provider.");
  }
  const begun = await ports.begin({
    provider: "custom",
    protocol: "openai-compatible",
    baseUrl: parsed.toString(),
    secret: TEST_CREDENTIAL_SECRET,
  });
  const metadata = begun.metadata;
  const originalConfig = ports.normalizeConfigJson(begun.configJson);
  if (originalConfig.customProvider.credentialRef) {
    const aborted = await ports.abort(begun.operationId);
    ports.acceptCommittedConfig(aborted.configJson);
    throw new Error("The deterministic provider requires a profile without a configured custom provider.");
  }
  const nextConfig = {
      ...originalConfig,
      model: {
        provider: "custom",
        model,
        credentialRef: metadata.credentialRef,
        protocol: "openai-compatible",
      },
      customProvider: {
        name: `${TEST_PROVIDER_NAME}:${nonce}`,
        baseUrl: metadata.canonicalBaseUrl,
        credentialRef: metadata.credentialRef,
        protocol: "openai-compatible",
        models: [{ name: model, callName: model, supportsImages: false }],
      },
    };
  const nextConfigJson = JSON.stringify(nextConfig);
  let lifecycle;
  try {
    lifecycle = await ports.commit(begun.operationId, nextConfigJson);
    ports.acceptCommittedConfig(lifecycle.configJson);
  } catch (commitError) {
    try {
      lifecycle = await ports.reconcile();
      ports.acceptCommittedConfig(lifecycle.configJson);
    } catch (reconcileError) {
      throw new AggregateError([commitError, reconcileError], "The E2E credential commit outcome could not be reconciled.");
    }
    if (ports.normalizeConfigJson(lifecycle.configJson).customProvider.credentialRef !== metadata.credentialRef) {
      throw commitError;
    }
  }
  return {
    provider: "custom",
    model,
    credentialRef: metadata.credentialRef,
    baseUrl: metadata.canonicalBaseUrl,
    cleanup: {
      nonce,
      credentialRef: metadata.credentialRef,
      restoreConfigJson: JSON.stringify(originalConfig),
    },
    cleanupPending: lifecycle.status === "pending",
    debugOnly: true,
  };
}

export async function clearDeterministicDebugProvider(nonce: string, credentialRef: string, restoreConfigJson: string) {
  assertDebugBuild();
  const desktopApi = installedDesktopApi();
  if (!desktopApi) throw new Error("Native credential storage is unavailable.");
  return clearDeterministicDebugProviderWithPorts(nonce, credentialRef, restoreConfigJson, {
    readConfig: readDesktopConfig,
    normalizeConfigJson: normalizeDesktopConfigJson,
    commitRetirement: (ref, next) => desktopApi.retireProviderCredential(ref, next),
    reconcile: () => desktopApi.reconcileProviderCredentials(),
    acceptCommittedConfig: acceptNativeDesktopConfigCommit,
  });
}

type DeterministicProviderOwnership = {
  customProvider: {
    credentialRef: string;
    name: string;
  };
};

export async function clearDeterministicDebugProviderWithPorts<Config extends DeterministicProviderOwnership>(
  nonce: string,
  credentialRef: string,
  restoreConfigJson: string,
  ports: {
    readConfig(): Config;
    normalizeConfigJson(rawJson: string): Config;
    commitRetirement(ref: string, nextConfigJson: string): Promise<{ status: "ready" | "pending"; operationId?: string; configJson: string }>;
    reconcile(): Promise<{ status: "ready" | "pending"; operationId?: string; configJson: string }>;
    acceptCommittedConfig(rawJson: string): void;
  },
) {
  assertNonce(nonce);
  const current = ports.readConfig();
  const expectedName = `${TEST_PROVIDER_NAME}:${nonce}`;
  if (current.customProvider.credentialRef !== credentialRef || current.customProvider.name !== expectedName) {
    throw new Error("The current provider configuration is not owned by this deterministic E2E run.");
  }
  const restoreConfig = ports.normalizeConfigJson(restoreConfigJson);
  const nextConfigJson = JSON.stringify(restoreConfig);
  let lifecycle;
  try {
    lifecycle = await ports.commitRetirement(credentialRef, nextConfigJson);
  } catch (commitError) {
    try {
      lifecycle = await ports.reconcile();
    } catch (reconcileError) {
      throw new AggregateError([commitError, reconcileError], "The debug credential retirement outcome could not be reconciled.");
    }
    const reconciled = ports.normalizeConfigJson(lifecycle.configJson);
    if (reconciled.customProvider.credentialRef === credentialRef) throw commitError;
  }
  ports.acceptCommittedConfig(lifecycle.configJson);
  return {
    cleared: lifecycle.status === "ready",
    configRestored: true,
    credentialDeleted: lifecycle.status === "ready",
    cleanupPending: lifecycle.status === "pending",
    debugOnly: true,
  };
}
