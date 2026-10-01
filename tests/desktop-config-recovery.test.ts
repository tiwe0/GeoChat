import { beforeEach, describe, expect, test } from "bun:test";
import {
  CONFIG_STORAGE_KEY,
  DESKTOP_CONFIG_SCHEMA_VERSION,
  createDefaultDesktopConfig,
  persistDesktopConfig,
} from "../src/shared/desktop/desktop-config";
import {
  DesktopConfigSensitiveDataRecoveryRequiredError,
  DesktopConfigUnsupportedVersionError,
  consumeDesktopConfigRecoveryNotice,
  recoverDesktopConfigBeforeLoad,
} from "../src/shared/desktop/desktop-config-recovery";

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

  test("does not write defaults into an empty store during bootstrap", async () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); },
    };

    expect(await recoverDesktopConfigBeforeLoad(storage)).toBeNull();
  });

  test("repairs only invalid fields and preserves valid provider, locale, and interaction settings", async () => {
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

    const notice = await recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "field-repair" });
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

  test("quarantines truncated JSON before restoring defaults", async () => {
    const raw = '{"schemaVersion":1,"locale":"zh-CN"';
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

    const notice = await recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "truncated" });

    expect(notice?.reason).toBe("malformed_json");
    expect(storage.getItem(notice!.quarantineKey)).toBe(raw);
    expect(JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? "{}")).toEqual(createDefaultDesktopConfig());
  });

  test("preserves an unsupported schema version byte-for-byte and fails closed", async () => {
    const raw = JSON.stringify({ schemaVersion: 999, locale: "en-US" });
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

    await expect(recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "future" }))
      .rejects.toThrow(DesktopConfigUnsupportedVersionError);

    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
    expect(Array.from(storage.values.keys()).some((key) => key.includes(":quarantine:"))).toBe(false);
    expect(consumeDesktopConfigRecoveryNotice()).toBeNull();
  });

  test("rejects a versionless config instead of upgrading it", async () => {
    const raw = JSON.stringify({ locale: "en-US" });
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

    await expect(recoverDesktopConfigBeforeLoad(storage)).rejects.toThrow(DesktopConfigUnsupportedVersionError);
    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
  });

  test.each(["apiKey", "secret", "token", "authorization"])(
    "preserves malformed JSON containing the %s credential marker without copying it",
    async (credentialMarker) => {
      const raw = `{"schemaVersion":1,"${credentialMarker}":"sensitive-value"`;
      const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

      await expect(recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "sensitive" }))
        .rejects.toThrow(DesktopConfigSensitiveDataRecoveryRequiredError);
      expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
      expect(Array.from(storage.values.keys()).some((key) => key.includes(":quarantine:"))).toBe(false);
      expect(consumeDesktopConfigRecoveryNotice()).toBeNull();
    },
  );

  test("repairs a non-string model id without losing unrelated valid fields", async () => {
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

    const notice = await recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "bad-model" });
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

  test("does not replace the original when quarantine persistence fails", async () => {
    const raw = "{truncated";
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });
    storage.failNextWriteFor(`${CONFIG_STORAGE_KEY}:quarantine:v1:blocked`);

    await expect(recoverDesktopConfigBeforeLoad(storage, { createQuarantineId: () => "blocked" }))
      .rejects.toThrow("storage write failed");
    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
  });

  test("does not queue a replacement when an asynchronous quarantine commit fails", async () => {
    const raw = "{truncated";
    const values = new Map([[CONFIG_STORAGE_KEY, raw]]);
    const pending: Array<readonly [string, string]> = [];
    const quarantineKey = `${CONFIG_STORAGE_KEY}:quarantine:v1:async-blocked`;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { pending.push([key, value]); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const flushWrites = async () => {
      const operation = pending.shift();
      if (!operation) return;
      if (operation[0] === quarantineKey) throw new Error("native commit failed");
      values.set(...operation);
    };

    await expect(recoverDesktopConfigBeforeLoad(storage, {
      createQuarantineId: () => "async-blocked",
      flushWrites,
    })).rejects.toThrow("native commit failed");

    expect(values.get(CONFIG_STORAGE_KEY)).toBe(raw);
    expect(pending).toEqual([]);
  });

  test("persist refuses to overwrite a future config version before quarantine", () => {
    const raw = JSON.stringify({ schemaVersion: 2, locale: "en-US" });
    const storage = memoryStorage({ [CONFIG_STORAGE_KEY]: raw });

    expect(() => persistDesktopConfig(createDefaultDesktopConfig(), storage))
      .toThrow(DesktopConfigUnsupportedVersionError);
    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
  });
});
