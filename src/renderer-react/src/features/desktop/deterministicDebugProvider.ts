import {
  acceptNativeDesktopConfigCommit,
  readDesktopConfig,
  normalizeDesktopConfigJson,
} from "../../../../shared/desktop/desktop-config";
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
  assertNonce(nonce);
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:" || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost")) {
    throw new Error("The deterministic provider must use a loopback HTTP URL.");
  }
  const desktopApi = installedDesktopApi();
  if (!desktopApi) throw new Error("Native credential storage is unavailable.");
  const originalConfig = readDesktopConfig();
  const expectedConfigJson = JSON.stringify(originalConfig);
  const begun = await desktopApi.beginProviderCredential({
    provider: "custom",
    protocol: "openai-compatible",
    baseUrl: parsed.toString(),
    secret: TEST_CREDENTIAL_SECRET,
  });
  const metadata = begun.metadata;
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
  try {
    const lifecycle = await desktopApi.commitProviderCredential(
      begun.operationId, expectedConfigJson, nextConfigJson,
    );
    acceptNativeDesktopConfigCommit(nextConfigJson);
    if (lifecycle.status !== "ready") throw new Error("Deterministic credential cleanup is pending.");
  } catch (error) {
    try {
      await desktopApi.abortProviderCredential(begun.operationId);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Failed to persist the E2E config and roll back its credential.");
    }
    throw error;
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
    commitRetirement: (ref, expected, next) => desktopApi.retireProviderCredential(ref, expected, next),
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
    commitRetirement(ref: string, expectedConfigJson: string, nextConfigJson: string): Promise<{ status: "ready" } | { status: "pending"; operationId: string }>;
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
  const expectedConfigJson = JSON.stringify(current);
  const nextConfigJson = JSON.stringify(restoreConfig);
  const lifecycle = await ports.commitRetirement(credentialRef, expectedConfigJson, nextConfigJson);
  ports.acceptCommittedConfig(nextConfigJson);
  return {
    cleared: lifecycle.status === "ready",
    configRestored: true,
    credentialDeleted: lifecycle.status === "ready",
    cleanupPending: lifecycle.status === "pending",
    debugOnly: true,
  };
}
