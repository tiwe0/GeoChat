import { describe, expect, test } from "bun:test";
import {
  applyLegacyDesktopCredentialMigrationPlan,
  canonicalizeCredentialEndpoint,
  hasLegacyPlaintextCredentials,
  planLegacyDesktopCredentialMigration,
  rollbackLegacyDesktopCredentialMigration,
  runLegacyDesktopCredentialMigration,
  type CredentialMigrationJournal,
  type LegacyCredentialIdentity,
} from "../src/shared/desktop/desktop-credentials";

function fingerprint(identity: LegacyCredentialIdentity) {
  return `sha256:${Bun.hash(JSON.stringify(identity)).toString(16)}`;
}

function planner(previousJournal?: CredentialMigrationJournal) {
  return {
    fingerprint,
    createCredentialRef: (sourceFingerprint: string) => `ref-${sourceFingerprint.slice(-8)}`,
    previousJournal,
  };
}

describe("desktop credential endpoint canonicalization", () => {
  test("defaults to HTTPS and normalizes host, default port, and base path", () => {
    expect(canonicalizeCredentialEndpoint("API.Example.COM:443/v1//")).toBe("https://api.example.com/v1");
    expect(canonicalizeCredentialEndpoint("https://API.Example.COM:443/v1///")).toBe("https://api.example.com/v1");
    expect(canonicalizeCredentialEndpoint("http://127.0.0.2:11434/v1/")).toBe("http://127.0.0.2:11434/v1");
  });

  test.each([
    "http://api.example.com/v1",
    "ftp://api.example.com/v1",
    "https://user:pass@api.example.com/v1",
    "https://api.example.com/v1?token=x",
    "https://api.example.com/v1?",
    "https://api.example.com/v1#fragment",
  ])("rejects unsafe endpoint %s", (endpoint) => {
    expect(() => canonicalizeCredentialEndpoint(endpoint)).toThrow();
  });
});

describe("legacy desktop credential migration", () => {
  const raw = JSON.stringify({
    locale: "en-US",
    interaction: { mode: "window" },
    skills: { enabled: false, enabledSkillNames: ["plane-geometry"] },
    debug: { modelStepTimeoutMs: 12_345 },
    untouched: { future: true },
    providerCredentials: {
      deepseek: { apiKey: "same-secret", customBaseUrl: "https://API.DEEPSEEK.COM:443/" },
      openrouter: { apiKey: "vision-secret", customBaseUrl: "https://openrouter.ai/api/v1/" },
    },
    model: {
      provider: "deepseek",
      model: "deepseek-flash",
      apiKey: "same-secret",
      customBaseUrl: "https://api.deepseek.com",
      maxToolSteps: 17,
    },
    visionModel: {
      provider: "openrouter",
      model: "google/gemini-test",
      apiKey: "vision-secret",
      customBaseUrl: "https://openrouter.ai/api/v1",
    },
    customProvider: {
      name: "Local",
      baseUrl: "http://localhost:11434/v1/",
      apiKey: "local-secret",
      protocol: "anthropic",
      models: [{ name: "Local vision", callName: "local-v", supportsImages: true }],
    },
  });

  test("reads all four raw sources, canonicalizes, and deduplicates exact credential identities", () => {
    const plan = planLegacyDesktopCredentialMigration(raw, planner());

    expect(plan.conflicts).toEqual([]);
    expect(plan.items).toHaveLength(3);
    expect(plan.items.find((item) => item.provider === "deepseek")?.sources.map((source) => source.kind))
      .toEqual(["providerCredentials", "model"]);
    expect(plan.items.find((item) => item.provider === "openrouter")?.sources.map((source) => source.kind))
      .toEqual(["providerCredentials", "visionModel"]);
    expect(plan.items.find((item) => item.provider === "custom")).toMatchObject({
      canonicalBaseUrl: "http://localhost:11434/v1",
      protocol: "anthropic",
    });
    expect(JSON.stringify(plan.journal)).not.toContain("same-secret");
    expect(JSON.stringify(plan.journal)).not.toContain("vision-secret");
    expect(JSON.stringify(plan.journal)).not.toContain("local-secret");
  });

  test("sanitizes every plaintext mirror while preserving non-sensitive config", () => {
    const plan = planLegacyDesktopCredentialMigration(raw, planner());
    const migrated = applyLegacyDesktopCredentialMigrationPlan(plan);

    expect(hasLegacyPlaintextCredentials(migrated)).toBe(false);
    expect(migrated).toMatchObject({
      locale: "en-US",
      interaction: { mode: "window" },
      skills: { enabled: false, enabledSkillNames: ["plane-geometry"] },
      debug: { modelStepTimeoutMs: 12_345 },
      untouched: { future: true },
      model: { provider: "deepseek", model: "deepseek-flash", maxToolSteps: 17 },
      customProvider: {
        name: "Local",
        baseUrl: "http://localhost:11434/v1",
        models: [{ name: "Local vision", callName: "local-v", supportsImages: true }],
      },
    });
    expect(JSON.stringify(migrated)).not.toContain("apiKey");
    expect(JSON.stringify(migrated)).not.toContain("customBaseUrl");
    expect((migrated.model as Record<string, unknown>).credentialRef).toBe(
      (migrated.providerCredentials as Record<string, Record<string, unknown>>).deepseek.credentialRef
    );
  });

  test("isolates conflicting identities instead of silently choosing the last source", () => {
    const conflictRaw = JSON.stringify({
      providerCredentials: { openai: { apiKey: "first", customBaseUrl: "https://api.openai.com" } },
      model: { provider: "openai", model: "gpt", apiKey: "second", customBaseUrl: "https://api.openai.com" },
    });
    const plan = planLegacyDesktopCredentialMigration(conflictRaw, planner());
    const migrated = applyLegacyDesktopCredentialMigrationPlan(plan);

    expect(plan.items).toHaveLength(2);
    expect((migrated.model as Record<string, unknown>).credentialRef).not.toBe(
      (migrated.providerCredentials as Record<string, Record<string, unknown>>).openai.credentialRef
    );
  });

  test("surfaces unsafe remote HTTP as an explicit conflict and refuses sanitization", () => {
    const plan = planLegacyDesktopCredentialMigration(JSON.stringify({
      model: { provider: "custom", model: "x", apiKey: "secret", customBaseUrl: "http://example.com/v1" },
    }), planner());

    expect(plan.conflicts).toMatchObject([{ reason: "invalid_endpoint", source: { kind: "model" } }]);
    expect(() => applyLegacyDesktopCredentialMigrationPlan(plan)).toThrow("unresolved conflicts");
  });

  test("does not silently coerce invalid provider protocol metadata", () => {
    const plan = planLegacyDesktopCredentialMigration(JSON.stringify({
      customProvider: {
        name: "Invalid",
        baseUrl: "https://example.com/v1",
        apiKey: "secret",
        protocol: "unknown-protocol",
      },
    }), planner());

    expect(plan.conflicts).toMatchObject([{ reason: "invalid_protocol" }]);
    expect(plan.items).toHaveLength(0);
  });

  test("recovers a crash after keychain write without creating a second entry", async () => {
    let durableJournal: CredentialMigrationJournal | undefined;
    let stored = 0;
    let config = raw;
    const entries = new Set<string>();
    const firstPlan = planLegacyDesktopCredentialMigration(raw, planner());
    let crashOnce = true;
    const callbacks = {
      persistJournal(next: CredentialMigrationJournal) {
        if (crashOnce && next.entries.some((entry) => entry.phase === "secretStored")) {
          crashOnce = false;
          throw new Error("simulated power loss");
        }
        durableJournal = next;
      },
      credentialExists: (credentialRef: string) => entries.has(credentialRef),
      storeCredential: ({ credentialRef }: { credentialRef: string }) => {
        stored += 1;
        entries.add(credentialRef);
      },
      writeSanitizedConfig: (next: string) => { config = next; },
      readConfig: () => config,
      deleteJournal: () => { durableJournal = undefined; },
    };

    await expect(runLegacyDesktopCredentialMigration(firstPlan, callbacks)).rejects.toThrow("simulated power loss");
    const recoveryPlan = planLegacyDesktopCredentialMigration(raw, planner(durableJournal));
    const completed = await runLegacyDesktopCredentialMigration(recoveryPlan, callbacks);

    expect(stored).toBe(firstPlan.items.length);
    expect(new Set(recoveryPlan.items.map((item) => item.credentialRef))).toEqual(
      new Set(firstPlan.items.map((item) => item.credentialRef))
    );
    expect(completed.entries.every((entry) => entry.phase === "complete")).toBe(true);
    expect(durableJournal).toBeUndefined();
    expect(hasLegacyPlaintextCredentials(JSON.parse(config))).toBe(false);
  });

  test("retains journal entries when recovery starts after config sanitization", () => {
    const initial = planLegacyDesktopCredentialMigration(raw, planner());
    const afterSanitize: CredentialMigrationJournal = {
      ...initial.journal,
      entries: initial.journal.entries.map((entry) => ({ ...entry, phase: "configSanitized" })),
    };
    const sanitizedRaw = JSON.stringify(applyLegacyDesktopCredentialMigrationPlan(initial));
    const recovered = planLegacyDesktopCredentialMigration(sanitizedRaw, planner(afterSanitize));

    expect(recovered.items).toHaveLength(0);
    expect(recovered.journal.entries).toEqual(afterSanitize.entries);
  });

  test("rollback deletes only entries not referenced by the current config", async () => {
    const initial = planLegacyDesktopCredentialMigration(raw, planner());
    const sanitized = applyLegacyDesktopCredentialMigrationPlan(initial);
    const retainedRef = initial.items[0]!.credentialRef;
    (sanitized.model as Record<string, unknown>).credentialRef = retainedRef;
    delete (sanitized.providerCredentials as Record<string, unknown>).openrouter;
    delete (sanitized.visionModel as Record<string, unknown>).credentialRef;
    delete sanitized.customProvider;
    const deleted: string[] = [];

    const orphaned = await rollbackLegacyDesktopCredentialMigration(
      initial.journal,
      JSON.stringify(sanitized),
      {
        deleteCredential: (credentialRef) => { deleted.push(credentialRef); },
        deleteJournal: () => {},
      }
    );

    expect(deleted).toEqual(orphaned);
    expect(deleted).not.toContain(retainedRef);
    expect(deleted).toHaveLength(initial.items.length - 1);
  });
});
