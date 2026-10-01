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

  test("retires the debug credential and restores config in one native lifecycle", async () => {
    const nonce = "12345678-1234-4123-8123-123456789abc";
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
});
