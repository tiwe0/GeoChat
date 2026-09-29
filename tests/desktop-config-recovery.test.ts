import { beforeEach, describe, expect, test } from "bun:test";
import {
  CONFIG_STORAGE_KEY,
  DESKTOP_CONFIG_SCHEMA_VERSION,
  DesktopCredentialMigrationRequiredError,
  createDefaultDesktopConfig,
  persistDesktopConfig,
} from "../src/shared/desktop/desktop-config";
import {
  DesktopConfigSensitiveDataRecoveryRequiredError,
  DesktopConfigUnsupportedVersionError,
  consumeDesktopConfigRecoveryNotice,
  recoverDesktopConfigBeforeLoad,
} from "../src/shared/desktop/desktop-config-recovery";
import { CREDENTIAL_MIGRATION_BACKUP_KEY } from "../src/shared/desktop/desktop-credential-bootstrap";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  let failWritesFor: string | undefined;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === failWritesFor) throw new Error("storage write failed");
      values.set(key, value);
    },
    removeItem: (key: string) => { values.delete(key); },
    failNextWriteFor: (key: string) => { failWritesFor = key; },
    values,
  };
}

describe("desktop config recovery", () => {
  beforeEach(() => {
    consumeDesktopConfigRecoveryNotice();
  });

  test("does not write defaults into an empty store during bootstrap", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); },
    };

    expect(recoverDesktopConfigBeforeLoad(storage)).toBeNull();
  });

  test("repairs only invalid fields and preserves valid provider, locale, and interaction settings", () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      locale: "en-US",
      interaction: { mode: "window" },
      debug: { modelStepTimeoutMs: "broken" },
      model: { provider: "deepseek", model: "deepseek-chat", credentialRef: "ref-primary" },
      visionModel: { provider: "openrouter", model: "google/gemini-3.8-flash", credentialRef: "ref-vision" },
      providerCredentials: {
        deepseek: { credentialRef: "ref-primary", baseUrl: "https://api.deepseek.com", protocol: "openai-compatible" },
        openrouter: { credentialRef: "ref-vision", baseUrl: "https://openrouter.ai/api/v1", protocol: "openai-compatible" },
      },
      customProvider: { name: "", baseUrl: "", credentialRef: "", protocol: "openai-compatible", models: [] },
      skills: { enabled: true, autoActivate: true, enabledSkillNames: [], visualProfile: "exam-clean" },
    });
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

    const notice = recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "field-repair" });
    const recovered = JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? "{}") as Record<string, any>;

    expect(recovered.schemaVersion).toBe(DESKTOP_CONFIG_SCHEMA_VERSION);
    expect(recovered.locale).toBe("en-US");
    expect(recovered.interaction).toEqual({ mode: "window" });
    expect(recovered.providerCredentials.deepseek.credentialRef).toBe("ref-primary");
    expect(recovered.debug.modelStepTimeoutMs).toBe(createDefaultDesktopConfig("en-US").debug.modelStepTimeoutMs);
    expect(notice?.reason).toBe("invalid_fields");
    expect(storage.getItem(notice!.quarantineKey)).toBe(raw);
    expect(consumeDesktopConfigRecoveryNotice()).toEqual(notice);
    expect(consumeDesktopConfigRecoveryNotice()).toBeNull();
  });

  test("quarantines truncated JSON before restoring defaults", () => {
    const raw = '{"schemaVersion":1,"locale":"zh-CN"';
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

    const notice = recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "truncated" });

    expect(notice?.reason).toBe("malformed_json");
    expect(storage.getItem(notice!.quarantineKey)).toBe(raw);
    expect(JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? "{}")).toEqual(createDefaultDesktopConfig());
  });

  test("preserves an unsupported schema version byte-for-byte and fails closed", () => {
    const raw = JSON.stringify({ schemaVersion: 999, locale: "en-US" });
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

    expect(() => recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "future" }))
      .toThrow(DesktopConfigUnsupportedVersionError);

    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
    expect(Array.from(storage.values.keys()).some((key) => key.includes(":quarantine:"))).toBe(false);
    expect(consumeDesktopConfigRecoveryNotice()).toBeNull();
  });

  test.each(["apiKey", "secret", "token", "authorization"])(
    "preserves malformed JSON containing the %s credential marker without copying it",
    (credentialMarker) => {
      const raw = `{"schemaVersion":1,"${credentialMarker}":"sensitive-value"`;
      const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

      expect(() => recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "sensitive" }))
        .toThrow(DesktopConfigSensitiveDataRecoveryRequiredError);
      expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
      expect(Array.from(storage.values.keys()).some((key) => key.includes(":quarantine:"))).toBe(false);
      expect(consumeDesktopConfigRecoveryNotice()).toBeNull();
    },
  );

  test("repairs a non-string model id without losing unrelated valid fields", () => {
    const raw = JSON.stringify({
      ...createDefaultDesktopConfig("en-US"),
      interaction: { mode: "window" },
      model: { provider: "deepseek", model: 42, credentialRef: "ref-primary" },
      providerCredentials: {
        deepseek: { credentialRef: "ref-primary", baseUrl: "https://api.deepseek.com", protocol: "openai-compatible" },
        retained: { credentialRef: "ref-retained", baseUrl: "https://retained.example/v1", protocol: "openai-compatible" },
      },
    });
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

    const notice = recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "bad-model" });
    const recovered = JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? "{}") as Record<string, any>;

    expect(notice?.reason).toBe("invalid_fields");
    expect(recovered.model.model).toBe(createDefaultDesktopConfig().model.model);
    expect(recovered.model.credentialRef).toBe("ref-primary");
    expect(recovered.locale).toBe("en-US");
    expect(recovered.interaction).toEqual({ mode: "window" });
    expect(recovered.providerCredentials.retained).toEqual({
      credentialRef: "ref-retained",
      baseUrl: "https://retained.example/v1",
      protocol: "openai-compatible",
    });
  });

  test("does not replace the original when quarantine persistence fails", () => {
    const raw = "{truncated";
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });
    storage.failNextWriteFor(`${CONFIG_STORAGE_KEY}:quarantine:v1:blocked`);

    expect(() => recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "blocked" }))
      .toThrow("storage write failed");
    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
  });

  test("does not recover over an unfinished credential migration backup", () => {
    const raw = "{truncated";
    const backup = JSON.stringify({ model: { apiKey: "secret" } });
    const storage = memoryStorage({
      [CONFIG_STORAGE_KEY]: raw,
      [CREDENTIAL_MIGRATION_BACKUP_KEY]: backup,
    });

    expect(() => recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "blocked" }))
      .toThrow(DesktopCredentialMigrationRequiredError);
    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
    expect(storage.getItem(CREDENTIAL_MIGRATION_BACKUP_KEY)).toBe(backup);
    expect(Array.from(storage.values.keys()).some((key) => key.includes(":quarantine:"))).toBe(false);
  });

  test("persist refuses to overwrite current or backup plaintext awaiting credential migration", () => {
    const safeConfig = createDefaultDesktopConfig();
    const legacy = JSON.stringify({ model: { provider: "deepseek", model: "deepseek-chat", apiKey: "secret" } });
    const currentLegacy = memoryStorage({ [CONFIG_STORAGE_KEY]: legacy });
    const backupLegacy = memoryStorage({
      [CONFIG_STORAGE_KEY]: JSON.stringify(safeConfig),
      [CREDENTIAL_MIGRATION_BACKUP_KEY]: legacy,
    });

    expect(() => persistDesktopConfig(safeConfig, currentLegacy)).toThrow(DesktopCredentialMigrationRequiredError);
    expect(currentLegacy.getItem(CONFIG_STORAGE_KEY)).toBe(legacy);
    expect(() => persistDesktopConfig(safeConfig, backupLegacy)).toThrow(DesktopCredentialMigrationRequiredError);
    expect(backupLegacy.getItem(CREDENTIAL_MIGRATION_BACKUP_KEY)).toBe(legacy);
  });

  test("persist refuses to overwrite a future config version before quarantine", () => {
    const raw = JSON.stringify({ schemaVersion: 2, locale: "en-US" });
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

    expect(() => persistDesktopConfig(createDefaultDesktopConfig(), storage))
      .toThrow(DesktopCredentialMigrationRequiredError);
    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
  });
});
