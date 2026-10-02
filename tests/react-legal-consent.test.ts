import { describe, expect, test } from "bun:test";
import type { GeoChatDesktopApi } from "../src/shared/desktop-api";
import {
  acceptLegalAgreement,
  hasAcceptedLegalAgreement,
  LEGAL_CONSENT_STORAGE_KEY,
  readLegalConsent,
} from "../src/renderer-react/src/features/legal/legalConsent";
import { installNativePreferences } from "../src/renderer-react/src/lib/nativePreferences";

type StorageApi = Pick<GeoChatDesktopApi, "getRendererStorage" | "removeRendererStorage" | "setRendererStorage">;
const CURRENT_LEGAL_AGREEMENT_VERSION = 1;

function nativeStorage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  let writes = 0;
  const api: StorageApi = {
    async getRendererStorage(keys) {
      const selected = keys ?? Array.from(values.keys());
      return Object.fromEntries(selected.flatMap((key) => values.has(key) ? [[key, values.get(key)]] : []));
    },
    async setRendererStorage(next) {
      writes += 1;
      for (const [key, value] of Object.entries(next)) values.set(key, value);
    },
    async removeRendererStorage(keys) {
      for (const key of keys) values.delete(key);
    },
  };
  return { api, values, get writes() { return writes; } };
}

describe("legal consent persistence", () => {
  test("starts blocked and reviewing consent does not write", async () => {
    const transport = nativeStorage();
    const preferences = await installNativePreferences(transport.api);

    expect(readLegalConsent(preferences)).toBeUndefined();
    expect(transport.writes).toBe(0);
  });

  test("durably accepts the current agreement and survives a reload", async () => {
    const transport = nativeStorage();
    const preferences = await installNativePreferences(transport.api);
    const now = new Date("2026-10-02T03:04:05.678Z");

    await expect(acceptLegalAgreement(preferences, now)).resolves.toEqual({
      version: CURRENT_LEGAL_AGREEMENT_VERSION,
      acceptedAt: now.toISOString(),
    });
    expect(transport.values.get(LEGAL_CONSENT_STORAGE_KEY)).toBe(JSON.stringify({
      version: CURRENT_LEGAL_AGREEMENT_VERSION,
      acceptedAt: now.toISOString(),
    }));

    const reloaded = await installNativePreferences(transport.api);
    expect(readLegalConsent(reloaded)).toEqual({
      version: CURRENT_LEGAL_AGREEMENT_VERSION,
      acceptedAt: now.toISOString(),
    });
  });

  test("does not expose consent before a deferred native write commits", async () => {
    const transport = nativeStorage();
    let releaseWrite!: () => void;
    const deferredWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const realSet = transport.api.setRendererStorage;
    transport.api.setRendererStorage = async (next) => {
      await deferredWrite;
      await realSet(next);
    };
    const preferences = await installNativePreferences(transport.api);

    const acceptance = acceptLegalAgreement(preferences, new Date("2026-10-02T03:04:05.678Z"));
    expect(readLegalConsent(preferences)).toBeUndefined();

    releaseWrite();
    await acceptance;
    expect(readLegalConsent(preferences)).toBeDefined();
  });

  test("keeps consent blocked after a failed native write", async () => {
    const transport = nativeStorage();
    transport.api.setRendererStorage = async () => { throw new Error("disk full"); };
    const preferences = await installNativePreferences(transport.api);

    await expect(acceptLegalAgreement(preferences)).rejects.toThrow("disk full");
    expect(readLegalConsent(preferences)).toBeUndefined();
  });

  test("rejects old versions and malformed records loaded from native storage", async () => {
    const acceptedAt = "2026-10-02T03:04:05.678Z";
    expect(hasAcceptedLegalAgreement({ version: CURRENT_LEGAL_AGREEMENT_VERSION, acceptedAt })).toBe(true);
    for (const value of [
      true,
      { version: CURRENT_LEGAL_AGREEMENT_VERSION - 1, acceptedAt },
      { version: CURRENT_LEGAL_AGREEMENT_VERSION, acceptedAt: "2026-10-02" },
      { version: CURRENT_LEGAL_AGREEMENT_VERSION, acceptedAt: "2026-02-30T03:04:05.678Z" },
      { version: CURRENT_LEGAL_AGREEMENT_VERSION, acceptedAt, extra: true },
    ]) {
      expect(hasAcceptedLegalAgreement(value)).toBe(false);
      const transport = nativeStorage({ [LEGAL_CONSENT_STORAGE_KEY]: JSON.stringify(value) });
      const preferences = await installNativePreferences(transport.api);
      expect(readLegalConsent(preferences)).toBeUndefined();
    }
  });
});
