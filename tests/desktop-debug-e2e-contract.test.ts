import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  assertRestoreEvidence,
  createTestProviderCleanupState,
  redactDesktopE2eEvidenceText,
} from "../tools/desktop-debug-e2e/evidence";
import {
  clearDeterministicDebugProviderWithPorts,
  configureDeterministicDebugProviderWithPorts,
} from "../src/renderer-react/src/features/desktop/deterministicDebugProvider";
import { createDefaultDesktopConfig } from "../src/shared/desktop/desktop-config";
import type { DesktopConfig } from "../src/shared/desktop/workbench-types";

describe("deterministic desktop E2E evidence", () => {
  const nonce = "12345678-1234-4123-8123-123456789abc";
  const debugCredentialRef = "11111111-1111-4111-8111-111111111111";
  const metadata = {
    credentialRef: debugCredentialRef,
    provider: "custom",
    protocol: "openai-compatible" as const,
    canonicalBaseUrl: "http://127.0.0.1:8787/v1",
  };
  test("isolates WebKit localStorage from the ordinary dev renderer origin", async () => {
    const source = await readFile("tools/run-deterministic-desktop-e2e.ts", "utf8");
    const capability = JSON.parse(await readFile("src-tauri/capabilities/dev-server.json", "utf8")) as {
      remote?: { urls?: string[] };
    };

    expect(source).toContain('const isolatedDevUrl = "http://localhost:1421"');
    expect(source).toContain("GEOCHAT_DEV_URL: isolatedDevUrl");
    expect(capability.remote?.urls).toContain("http://localhost:1421");
  });

  test("always terminates the spawned process group even after its root process exits", async () => {
    const source = await readFile("tools/run-deterministic-desktop-e2e.ts", "utf8");
    expect(source).toContain("const processGroupId = child?.pid");
    expect(source).toContain('process.kill(-processGroupId, "SIGTERM")');
    expect(source).toContain('process.kill(-processGroupId, "SIGKILL")');
    expect(source).not.toContain("child.exitCode !== null) return");
  });

  test("preserves the native profile whenever provider setup cleanup is incomplete", async () => {
    const source = await readFile("tools/run-deterministic-desktop-e2e.ts", "utf8");
    expect(source).toContain("providerConfigurationAttempted = true");
    expect(source).toContain("const preserveUserDataDir = providerConfigurationAttempted");
    expect(source).toContain("if (!preserveUserDataDir) rmSync(userDataDir");
    expect(source).toContain("recoveryPath: userDataDir");
    expect(source).not.toContain("\n    rmSync(userDataDir, { recursive: true, force: true });");
  });

  test("accepts only a real message and canvas restore result", () => {
    expect(() => assertRestoreEvidence({
      conversationId: "conversation-1",
      messageCount: 3,
      recovery: { messages: "restored", canvas: "replayed" },
    }, "conversation-1")).not.toThrow();
  });

  test("rejects a session-only activation result", () => {
    expect(() => assertRestoreEvidence({
      conversationId: "conversation-1",
      messageCount: 0,
      recovery: { messages: "not_loaded", canvas: "not_required" },
    }, "conversation-1")).toThrow(/message count/);
  });

  test("redacts runtime authorization tokens from failure evidence", () => {
    expect(redactDesktopE2eEvidenceText(
      "Authorization: Bearer runtime-secret; runtime-secret",
      ["runtime-secret"],
    )).toBe("Authorization: Bearer [REDACTED]; [REDACTED]");
  });

  test("requires cleanup as soon as provider configuration is attempted", () => {
    const cleanup = createTestProviderCleanupState();
    cleanup.register({ nonce: "nonce", credentialRef: "ref", restoreConfigJson: "{}" });
    expect(cleanup.needsCleanup()).toBe(true);
    cleanup.markResult({ attempted: true, completed: true });
    expect(cleanup.needsCleanup()).toBe(false);
  });

  test("recovers debug provider creation after the native commit response is lost", async () => {
    const original = createDefaultDesktopConfig("en-US");
    let committedConfigJson = "";
    const accepted: string[] = [];
    const result = await configureDeterministicDebugProviderWithPorts(
      "http://127.0.0.1:8787/v1",
      "debug-model",
      nonce,
      {
        readConfig: () => original,
        normalizeConfigJson: (raw) => JSON.parse(raw) as DesktopConfig,
        begin: async () => ({ operationId: "operation", metadata, configJson: JSON.stringify(original) }),
        commit: async (_operationId, nextConfigJson) => {
          committedConfigJson = nextConfigJson;
          throw new Error("IPC response lost");
        },
        abort: async () => { throw new Error("must not abort an unknown commit"); },
        reconcile: async () => ({ status: "ready", configJson: committedConfigJson }),
        acceptCommittedConfig: (raw) => accepted.push(raw),
      },
    );

    expect(result).toMatchObject({ credentialRef: debugCredentialRef, cleanupPending: false });
    expect(result.cleanup.restoreConfigJson).toBe(JSON.stringify(original));
    expect(accepted).toEqual([committedConfigJson]);
  });

  test("reconciles a lost begin response before reporting a safe failure", async () => {
    const original = createDefaultDesktopConfig("en-US");
    const beginError = new Error("begin response lost");
    const accepted: string[] = [];

    await expect(configureDeterministicDebugProviderWithPorts(
      "http://127.0.0.1:8787/v1",
      "debug-model",
      nonce,
      {
        readConfig: () => original,
        normalizeConfigJson: (raw) => JSON.parse(raw) as DesktopConfig,
        begin: async () => { throw beginError; },
        commit: async () => { throw new Error("must not commit"); },
        abort: async () => { throw new Error("must not abort without an operation id"); },
        reconcile: async () => ({ status: "ready", configJson: JSON.stringify(original) }),
        acceptCommittedConfig: (raw) => accepted.push(raw),
      },
    )).rejects.toBe(beginError);
    expect(accepted).toEqual([JSON.stringify(original)]);
  });

  test("returns profile recovery ownership when begin reconciliation remains pending", async () => {
    const original = createDefaultDesktopConfig("en-US");
    const accepted: string[] = [];

    const result = await configureDeterministicDebugProviderWithPorts(
      "http://127.0.0.1:8787/v1",
      "debug-model",
      nonce,
      {
        readConfig: () => original,
        normalizeConfigJson: (raw) => JSON.parse(raw) as DesktopConfig,
        begin: async () => { throw new Error("begin response lost"); },
        commit: async () => { throw new Error("must not commit"); },
        abort: async () => { throw new Error("must not abort without an operation id"); },
        reconcile: async () => ({
          status: "pending",
          operationId: "operation",
          configJson: JSON.stringify(original),
        }),
        acceptCommittedConfig: (raw) => accepted.push(raw),
      },
    );

    expect(result).toEqual({
      provider: "custom",
      setupPending: true,
      cleanupPending: true,
      operationId: "operation",
      recovery: { kind: "native-credential-journal", preserveUserDataDir: true },
      debugOnly: true,
    });
    expect(accepted).toEqual([JSON.stringify(original)]);
  });

  test("aborts debug creation when the authoritative config already owns a custom credential", async () => {
    const original = createDefaultDesktopConfig("en-US");
    const authoritative = {
      ...original,
      customProvider: { ...original.customProvider, credentialRef: "existing-custom-ref" },
    };
    let aborted = false;

    await expect(configureDeterministicDebugProviderWithPorts(
      "http://localhost:8787/v1",
      "debug-model",
      nonce,
      {
        readConfig: () => original,
        normalizeConfigJson: (raw) => JSON.parse(raw) as DesktopConfig,
        begin: async () => ({ operationId: "operation", metadata, configJson: JSON.stringify(authoritative) }),
        commit: async () => { throw new Error("must not commit"); },
        abort: async () => {
          aborted = true;
          return { status: "ready", configJson: JSON.stringify(original) };
        },
        reconcile: async () => ({ status: "ready", configJson: JSON.stringify(original) }),
        acceptCommittedConfig: () => undefined,
      },
    )).rejects.toThrow("without a configured custom provider");
    expect(aborted).toBe(true);
  });

  test("returns profile recovery ownership when abort cleanup remains pending", async () => {
    const original = createDefaultDesktopConfig("en-US");
    const authoritative = {
      ...original,
      customProvider: { ...original.customProvider, credentialRef: "existing-custom-ref" },
    };
    const accepted: string[] = [];

    const result = await configureDeterministicDebugProviderWithPorts(
      "http://localhost:8787/v1",
      "debug-model",
      nonce,
      {
        readConfig: () => original,
        normalizeConfigJson: (raw) => JSON.parse(raw) as DesktopConfig,
        begin: async () => ({ operationId: "operation", metadata, configJson: JSON.stringify(authoritative) }),
        commit: async () => { throw new Error("must not commit"); },
        abort: async () => ({
          status: "pending",
          operationId: "operation",
          configJson: JSON.stringify(original),
        }),
        reconcile: async () => { throw new Error("must not reconcile a successful abort response"); },
        acceptCommittedConfig: (raw) => accepted.push(raw),
      },
    );

    expect(result).toMatchObject({
      setupPending: true,
      cleanupPending: true,
      operationId: "operation",
      recovery: { preserveUserDataDir: true },
    });
    expect(accepted).toEqual([JSON.stringify(original)]);
  });

  test("returns a cleanup handle when debug creation commits with pending cleanup", async () => {
    const original = createDefaultDesktopConfig("en-US");
    const result = await configureDeterministicDebugProviderWithPorts(
      "http://127.0.0.1:8787/v1",
      "debug-model",
      nonce,
      {
        readConfig: () => original,
        normalizeConfigJson: (raw) => JSON.parse(raw) as DesktopConfig,
        begin: async () => ({ operationId: "operation", metadata, configJson: JSON.stringify(original) }),
        commit: async (_operationId, nextConfigJson) => ({
          status: "pending",
          operationId: "operation",
          configJson: nextConfigJson,
        }),
        abort: async () => { throw new Error("must not abort"); },
        reconcile: async () => { throw new Error("must not reconcile a successful response"); },
        acceptCommittedConfig: () => undefined,
      },
    );

    expect(result.cleanupPending).toBe(true);
    expect(result.cleanup.credentialRef).toBe(debugCredentialRef);
  });

  test("retires the debug credential and restores config in one native lifecycle", async () => {
    const credentialRef = "credential-e2e";
    const ownedConfig = { customProvider: { name: `GeoChat deterministic E2E:${nonce}`, credentialRef } };
    const restoredConfig = { customProvider: { name: "Restored provider", credentialRef: "restored-ref" } };
    let currentConfig = ownedConfig;
    let attempts = 0;
    const accepted: string[] = [];
    const ports = {
      readConfig: () => currentConfig,
      normalizeConfigJson: (raw: string) => JSON.parse(raw) as typeof ownedConfig,
      commitRetirement: async (_ref: string, next: string) => {
        attempts += 1;
        if (attempts === 1) throw new Error("simulated native lifecycle failure");
        currentConfig = JSON.parse(next);
        return { status: "ready" as const, configJson: next };
      },
      reconcile: async () => ({ status: "ready" as const, configJson: JSON.stringify(currentConfig) }),
      acceptCommittedConfig: (raw: string) => accepted.push(raw),
    };

    const restoreConfigJson = JSON.stringify(restoredConfig);
    await expect(clearDeterministicDebugProviderWithPorts(nonce, credentialRef, restoreConfigJson, ports)).rejects.toThrow("native lifecycle failure");
    expect(currentConfig).toBe(ownedConfig);

    await expect(clearDeterministicDebugProviderWithPorts(nonce, credentialRef, restoreConfigJson, ports)).resolves.toMatchObject({
      configRestored: true,
      credentialDeleted: true,
    });
    expect(currentConfig).toEqual(restoredConfig);
    expect(attempts).toBe(2);
    expect(accepted).toHaveLength(1);
  });

  test("recovers debug retirement after the native response is lost", async () => {
    const ownedConfig = {
      customProvider: { name: `GeoChat deterministic E2E:${nonce}`, credentialRef: debugCredentialRef },
    };
    const restoredConfig = { customProvider: { name: "", credentialRef: "" } };
    let currentConfig = ownedConfig;
    const accepted: string[] = [];

    const result = await clearDeterministicDebugProviderWithPorts(
      nonce,
      debugCredentialRef,
      JSON.stringify(restoredConfig),
      {
        readConfig: () => currentConfig,
        normalizeConfigJson: (raw) => JSON.parse(raw) as typeof ownedConfig,
        commitRetirement: async (_ref, next) => {
          currentConfig = JSON.parse(next);
          throw new Error("IPC response lost");
        },
        reconcile: async () => ({ status: "ready", configJson: JSON.stringify(currentConfig) }),
        acceptCommittedConfig: (raw) => accepted.push(raw),
      },
    );

    expect(result).toMatchObject({ cleared: true, configRestored: true, credentialDeleted: true });
    expect(accepted).toEqual([JSON.stringify(restoredConfig)]);
  });

  test("accepts authoritative config while debug retirement cleanup is pending", async () => {
    const ownedConfig = {
      customProvider: { name: `GeoChat deterministic E2E:${nonce}`, credentialRef: debugCredentialRef },
    };
    const restoredConfig = { customProvider: { name: "", credentialRef: "" } };
    const restoredConfigJson = JSON.stringify(restoredConfig);
    const accepted: string[] = [];

    const result = await clearDeterministicDebugProviderWithPorts(
      nonce,
      debugCredentialRef,
      restoredConfigJson,
      {
        readConfig: () => ownedConfig,
        normalizeConfigJson: (raw) => JSON.parse(raw) as typeof ownedConfig,
        commitRetirement: async () => ({
          status: "pending",
          operationId: "operation",
          configJson: restoredConfigJson,
        }),
        reconcile: async () => { throw new Error("must not reconcile a successful response"); },
        acceptCommittedConfig: (raw) => accepted.push(raw),
      },
    );

    expect(result).toEqual({
      cleared: false,
      configRestored: true,
      credentialDeleted: false,
      cleanupPending: true,
      debugOnly: true,
    });
    expect(accepted).toEqual([restoredConfigJson]);
  });
});
