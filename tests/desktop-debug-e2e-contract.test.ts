import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  assertRestoreEvidence,
  createTestProviderCleanupState,
  redactDesktopE2eEvidenceText,
} from "../tools/desktop-debug-e2e/evidence";
import { clearDeterministicDebugProviderWithPorts } from "../src/renderer-react/src/features/desktop/deterministicDebugProvider";

describe("deterministic desktop E2E evidence", () => {
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

  test("retries credential deletion and config restoration without losing cleanup ownership", async () => {
    const nonce = "12345678-1234-4123-8123-123456789abc";
    const credentialRef = "credential-e2e";
    const ownedConfig = { customProvider: { name: `GeoChat deterministic E2E:${nonce}`, credentialRef } };
    const restoredConfig = { customProvider: { name: "Restored provider", credentialRef: "restored-ref" } };
    let currentConfig = ownedConfig;
    let credentialConfigured = true;
    let deleteAttempts = 0;
    let persistAttempts = 0;
    const ports = {
      readConfig: () => currentConfig,
      normalizeConfigJson: () => restoredConfig,
      persistConfig: (config: typeof currentConfig) => {
        persistAttempts += 1;
        if (persistAttempts === 1) throw new Error("simulated config write failure");
        currentConfig = config;
      },
      isCredentialConfigured: async () => credentialConfigured,
      deleteCredential: async () => {
        deleteAttempts += 1;
        if (deleteAttempts === 1) throw new Error("simulated keychain failure");
        credentialConfigured = false;
      },
    };

    await expect(clearDeterministicDebugProviderWithPorts(nonce, credentialRef, "{}", ports)).rejects.toThrow("keychain failure");
    expect(currentConfig).toBe(ownedConfig);
    expect(credentialConfigured).toBe(true);

    await expect(clearDeterministicDebugProviderWithPorts(nonce, credentialRef, "{}", ports)).rejects.toThrow("config write failure");
    expect(currentConfig).toBe(ownedConfig);
    expect(credentialConfigured).toBe(false);

    await expect(clearDeterministicDebugProviderWithPorts(nonce, credentialRef, "{}", ports)).resolves.toMatchObject({
      configRestored: true,
      credentialDeleted: true,
    });
    expect(currentConfig).toBe(restoredConfig);
    expect(deleteAttempts).toBe(2);
  });
});
