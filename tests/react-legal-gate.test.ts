import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GeoChatDesktopApi } from "../src/shared/desktop-api";
import { LegalAgreementGate } from "../src/renderer-react/src/features/legal/LegalAgreementGate";
import { acceptLegalAgreement, LEGAL_CONSENT_STORAGE_KEY } from "../src/renderer-react/src/features/legal/legalConsent";
import { LEGAL_AGREEMENT_VERSION } from "../src/renderer-react/src/features/legal/legalDocuments";
import { initializeI18n } from "../src/renderer-react/src/i18n";
import { installNativePreferences } from "../src/renderer-react/src/lib/nativePreferences";

function storage(record?: unknown) {
  const values = new Map<string, string>([["geogebraCopilotLanguage", JSON.stringify("en")]]);
  if (record !== undefined) values.set(LEGAL_CONSENT_STORAGE_KEY, JSON.stringify(record));
  const api: Pick<GeoChatDesktopApi, "getRendererStorage" | "setRendererStorage" | "removeRendererStorage"> = {
    async getRendererStorage() { return Object.fromEntries(values); },
    async setRendererStorage(next) {
      for (const [key, value] of Object.entries(next)) values.set(key, value as string);
    },
    async removeRendererStorage(keys) { for (const key of keys) values.delete(key); },
  };
  return api;
}

function workspaceMounts() {
  let mounts = 0;
  function Workspace() {
    mounts += 1;
    return createElement("div", null, "workspace");
  }
  renderToStaticMarkup(createElement(LegalAgreementGate, { onExit: async () => {} }, createElement(Workspace)));
  return mounts;
}

describe("legal workspace gate", () => {
  test("does not mount the workspace for fresh or invalid consent", async () => {
    for (const record of [undefined, true, { version: 0, acceptedAt: "2026-10-02T00:00:00.000Z" }]) {
      await installNativePreferences(storage(record));
      await initializeI18n();
      expect(workspaceMounts()).toBe(0);
    }
  });

  test("mounts the workspace on subsequent launches with durable consent", async () => {
    await installNativePreferences(storage({ version: LEGAL_AGREEMENT_VERSION, acceptedAt: "2026-10-02T00:00:00.000Z" }));
    await initializeI18n();
    expect(workspaceMounts()).toBe(1);
  });

  test("keeps the workspace unmounted until native persistence completes", async () => {
    const api = storage();
    let release!: () => void;
    const committed = new Promise<void>((resolve) => { release = resolve; });
    const set = api.setRendererStorage;
    api.setRendererStorage = async (next) => { await committed; await set(next); };
    await installNativePreferences(api);
    await initializeI18n();
    const acceptance = acceptLegalAgreement();
    expect(workspaceMounts()).toBe(0);
    release();
    await acceptance;
    await installNativePreferences(api);
    expect(workspaceMounts()).toBe(1);
  });

  test("keeps the workspace unmounted when saving fails", async () => {
    const api = storage();
    api.setRendererStorage = async () => { throw new Error("write denied"); };
    await installNativePreferences(api);
    await initializeI18n();
    await expect(acceptLegalAgreement()).rejects.toThrow("write denied");
    expect(workspaceMounts()).toBe(0);
  });

  test("gates App at startup and exposes read-only review in general settings", () => {
    const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    const main = source("../src/renderer-react/src/main.tsx");
    const settings = source("../src/renderer-react/src/features/desktop/settings/GeneralSettings.tsx");
    const gate = source("../src/renderer-react/src/features/legal/LegalAgreementGate.tsx");
    expect(main).toMatch(/<LegalAgreementGate[^\n]*>\s*<App\s*\/>\s*<\/LegalAgreementGate>/);
    expect(settings).toContain('mode="review"');
    expect(settings).not.toContain("acceptLegalAgreement");
    expect(gate.indexOf("await acceptLegalAgreement()")).toBeLessThan(gate.indexOf("setConsent({ accepted: true"));
    expect(gate).toContain("await onExit()");
    expect(main).toContain("getCurrentWindow().close()");
  });
});
