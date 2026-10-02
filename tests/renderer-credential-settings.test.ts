import { describe, expect, test } from "bun:test";
import {
  credentialCleanupCanRetry,
  credentialCleanupBlocksSave,
  CredentialCleanupRequiredError,
  probeUnsavedProviderCredential,
  readCredentialAvailability,
  replaceProviderCredential,
} from "../src/renderer-react/src/features/desktop/settings/ModelSettings";
import { DEFAULT_DESKTOP_CONFIG, updateProviderCredentials } from "../src/shared/desktop/desktop-config";
import type { DesktopProviderCredentialMetadata } from "../src/shared/desktop-api";

const METADATA: DesktopProviderCredentialMetadata = {
  credentialRef: "new-ref", provider: "deepseek", protocol: "openai-compatible",
  canonicalBaseUrl: "https://api.deepseek.com",
};
const REQUEST = {
  provider: "deepseek", protocol: "openai-compatible" as const,
  baseUrl: "https://api.deepseek.com", secret: "new-secret",
};

const INITIAL_CONFIG_JSON = JSON.stringify(DEFAULT_DESKTOP_CONFIG);

function nextConfig(metadata: DesktopProviderCredentialMetadata, config = DEFAULT_DESKTOP_CONFIG) {
  return updateProviderCredentials(config, metadata.provider, {
    credentialRef: metadata.credentialRef,
    baseUrl: metadata.canonicalBaseUrl,
    protocol: metadata.protocol,
  });
}

describe("renderer provider credential replacement", () => {
  test("treats a stale credential reference as missing", async () => {
    expect(await readCredentialAvailability({
      getProviderCredentialStatus: async (credentialRef) => ({
        credentialRef,
        configured: false,
        metadata: null,
      }),
    }, "stale-ref")).toBe("missing");
  });

  test("reports configured only when native storage resolves the reference", async () => {
    expect(await readCredentialAvailability({
      getProviderCredentialStatus: async (credentialRef) => ({
        credentialRef,
        configured: true,
        metadata: { ...METADATA, credentialRef },
      }),
    }, "stored-ref")).toBe("configured");
  });

  test("fails closed when credential status cannot be read", async () => {
    expect(await readCredentialAvailability(null, "stored-ref")).toBe("unavailable");
    expect(await readCredentialAvailability({
      getProviderCredentialStatus: async () => { throw new Error("native store unavailable"); },
    }, "stored-ref")).toBe("unavailable");
    expect(await readCredentialAvailability({
      getProviderCredentialStatus: async () => { throw new Error("must not be called"); },
    }, "")).toBe("missing");
  });

  test("probes an unsaved key through a temporary native credential and always removes it", async () => {
    const events: string[] = [];
    const outcome = await probeUnsavedProviderCredential({
      desktopApi: {
        beginProviderCredential: async (request) => {
          expect(request).toEqual(REQUEST);
          events.push("begin");
          return { operationId: "operation", metadata: METADATA, configJson: INITIAL_CONFIG_JSON };
        },
        abortProviderCredential: async () => { events.push("abort"); return { status: "ready", configJson: INITIAL_CONFIG_JSON }; },
        reconcileProviderCredentials: async () => { events.push("reconcile"); return { status: "ready", configJson: INITIAL_CONFIG_JSON }; },
      },
      request: REQUEST,
      probe: async (credentialRef) => { events.push(`probe:${credentialRef}`); return { status: "ok", ids: [], fetchedAt: 1, fromCache: false }; },
      acceptConfig: () => events.push("accept"),
    });
    expect(outcome.status).toBe("ok");
    expect(events).toEqual(["begin", "probe:new-ref", "abort", "accept"]);
  });

  test("cleans up the temporary credential when discovery rejects the key", async () => {
    const events: string[] = [];
    const outcome = await probeUnsavedProviderCredential({
      desktopApi: {
        beginProviderCredential: async () => ({ operationId: "operation", metadata: METADATA, configJson: INITIAL_CONFIG_JSON }),
        abortProviderCredential: async () => { events.push("abort"); return { status: "ready", configJson: INITIAL_CONFIG_JSON }; },
        reconcileProviderCredentials: async () => { throw new Error("unexpected reconcile"); },
      },
      request: REQUEST,
      probe: async () => ({ status: "failed", message: "Provider responded 401" }),
      acceptConfig: () => undefined,
    });
    expect(outcome).toEqual({ status: "failed", message: "Provider responded 401" });
    expect(events).toEqual(["abort"]);
  });

  test("blocks further credential writes when temporary credential cleanup remains pending", async () => {
    await expect(probeUnsavedProviderCredential({
      desktopApi: {
        beginProviderCredential: async () => ({ operationId: "operation", metadata: METADATA, configJson: INITIAL_CONFIG_JSON }),
        abortProviderCredential: async () => ({ status: "pending", operationId: "operation", configJson: INITIAL_CONFIG_JSON }),
        reconcileProviderCredentials: async () => { throw new Error("unexpected reconcile"); },
      },
      request: REQUEST,
      probe: async () => ({ status: "ok", ids: [], fetchedAt: 1, fromCache: false }),
      acceptConfig: () => undefined,
    })).rejects.toMatchObject({ operationId: "operation", phase: "uncommitted" });
  });

  test("fails closed while lifecycle state is loading, pending, or errored", () => {
    expect(credentialCleanupBlocksSave({ status: "loading" })).toBe(true);
    expect(credentialCleanupBlocksSave({ status: "error" })).toBe(true);
    expect(credentialCleanupBlocksSave({ status: "pending", operationId: "operation" })).toBe(true);
    expect(credentialCleanupBlocksSave({ status: "ready" })).toBe(false);
    expect(credentialCleanupCanRetry({ status: "loading" })).toBe(false);
    expect(credentialCleanupCanRetry({ status: "ready" })).toBe(false);
    expect(credentialCleanupCanRetry({ status: "error" })).toBe(true);
    expect(credentialCleanupCanRetry({ status: "pending", operationId: "operation" })).toBe(true);
  });

  test("uses begin, validation, and native config CAS without renderer deletion", async () => {
    const events: string[] = [];
    const result = await replaceProviderCredential({
      desktopApi: {
        beginProviderCredential: async () => { events.push("begin"); return { operationId: "operation", metadata: METADATA, configJson: INITIAL_CONFIG_JSON }; },
        commitProviderCredential: async (_operationId, configJson) => { events.push("commit"); return { status: "ready", configJson }; },
        abortProviderCredential: async () => { events.push("abort"); return { status: "ready", configJson: INITIAL_CONFIG_JSON }; },
        reconcileProviderCredentials: async () => ({ status: "ready", configJson: INITIAL_CONFIG_JSON }),
      },
      request: REQUEST,
      onCredentialStored: () => events.push("clear"),
      validate: async (credentialRef) => events.push(`validate:${credentialRef}`),
      buildNextConfig: nextConfig,
      acceptCommittedConfig: () => events.push("mirror"),
    });
    expect(events).toEqual(["begin", "clear", "validate:new-ref", "commit", "mirror"]);
    expect(result).toEqual({ metadata: METADATA, cleanup: { status: "complete" } });
  });

  test("validation failure aborts the journaled operation", async () => {
    const events: string[] = [];
    await expect(replaceProviderCredential({
      desktopApi: {
        beginProviderCredential: async () => { events.push("begin"); return { operationId: "operation", metadata: METADATA, configJson: INITIAL_CONFIG_JSON }; },
        commitProviderCredential: async (_operationId, configJson) => ({ status: "ready", configJson }),
        abortProviderCredential: async () => { events.push("abort"); return { status: "ready", configJson: INITIAL_CONFIG_JSON }; },
        reconcileProviderCredentials: async () => ({ status: "ready", configJson: INITIAL_CONFIG_JSON }),
      },
      request: REQUEST,
      onCredentialStored: () => events.push("clear"),
      validate: async () => { events.push("validate"); throw new Error("invalid credential"); },
      buildNextConfig: nextConfig,
      acceptCommittedConfig: () => events.push("mirror"),
    })).rejects.toThrow("invalid credential");
    expect(events).toEqual(["begin", "clear", "validate", "abort", "mirror"]);
  });

  test("reconciles an ambiguous begin failure before allowing another save", async () => {
    const events: string[] = [];
    const beginError = new Error("begin response lost");
    await expect(replaceProviderCredential({
      desktopApi: {
        beginProviderCredential: async () => { events.push("begin"); throw beginError; },
        commitProviderCredential: async (_operationId, configJson) => ({ status: "ready", configJson }),
        abortProviderCredential: async () => ({ status: "ready", configJson: INITIAL_CONFIG_JSON }),
        reconcileProviderCredentials: async () => {
          events.push("reconcile");
          return { status: "pending", operationId: "operation", configJson: INITIAL_CONFIG_JSON };
        },
      },
      request: REQUEST,
      onCredentialStored: () => events.push("clear"),
      validate: async () => events.push("validate"),
      buildNextConfig: nextConfig,
      acceptCommittedConfig: () => events.push("mirror"),
    })).rejects.toMatchObject({ operationId: "operation", phase: "uncommitted" });
    expect(events).toEqual(["begin", "reconcile", "mirror"]);
  });

  test("publishes ready reconciliation after begin failure and preserves the original error", async () => {
    const events: string[] = [];
    const beginError = new Error("credential store unavailable");
    await expect(replaceProviderCredential({
      desktopApi: {
        beginProviderCredential: async () => { events.push("begin"); throw beginError; },
        commitProviderCredential: async (_operationId, configJson) => ({ status: "ready", configJson }),
        abortProviderCredential: async () => ({ status: "ready", configJson: INITIAL_CONFIG_JSON }),
        reconcileProviderCredentials: async () => { events.push("reconcile"); return { status: "ready", configJson: INITIAL_CONFIG_JSON }; },
      },
      request: REQUEST,
      onCredentialStored: () => events.push("clear"),
      validate: async () => events.push("validate"),
      buildNextConfig: nextConfig,
      acceptCommittedConfig: () => events.push("mirror"),
    })).rejects.toBe(beginError);
    expect(events).toEqual(["begin", "reconcile", "mirror"]);
  });

  test("recovers a lost commit response from the authoritative native config", async () => {
    const committedConfigJson = JSON.stringify(nextConfig(METADATA));
    const result = await replaceProviderCredential({
      desktopApi: {
        beginProviderCredential: async () => ({ operationId: "operation", metadata: METADATA, configJson: INITIAL_CONFIG_JSON }),
        commitProviderCredential: async () => { throw new Error("IPC response lost"); },
        abortProviderCredential: async () => { throw new Error("must not abort an unknown commit outcome"); },
        reconcileProviderCredentials: async () => ({ status: "ready", configJson: committedConfigJson }),
      },
      request: REQUEST,
      onCredentialStored: () => undefined,
      validate: async () => undefined,
      buildNextConfig: nextConfig,
      acceptCommittedConfig: () => undefined,
    });

    expect(result).toEqual({ metadata: METADATA, cleanup: { status: "complete" } });
  });

  test("surfaces retryable native pending state without exposing the secret", async () => {
    let caught: unknown;
    try {
      await replaceProviderCredential({
        desktopApi: {
          beginProviderCredential: async () => ({ operationId: "operation", metadata: METADATA, configJson: INITIAL_CONFIG_JSON }),
          commitProviderCredential: async () => { throw new Error("config CAS failed"); },
          abortProviderCredential: async () => { throw new Error("must not abort an unknown commit outcome"); },
          reconcileProviderCredentials: async () => ({ status: "pending", operationId: "operation", configJson: INITIAL_CONFIG_JSON }),
        },
        request: REQUEST,
        onCredentialStored: () => undefined,
        validate: async () => undefined,
        buildNextConfig: nextConfig,
        acceptCommittedConfig: () => undefined,
      });
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(CredentialCleanupRequiredError);
    expect(caught).toMatchObject({ operationId: "operation", phase: "uncommitted" });
    expect(String(caught)).not.toContain("new-secret");
  });
});
