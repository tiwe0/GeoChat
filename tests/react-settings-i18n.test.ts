import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { en } from "../src/renderer-react/src/i18n/locales/en";
import { zhCN } from "../src/renderer-react/src/i18n/locales/zh-CN";

/**
 * `t("some.key")` is a plain string to the compiler, so a typo in a key is
 * invisible to typecheck and surfaces as the raw key rendered in the UI.
 * These two checks close that gap for the desktop settings surface.
 */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

function resolve(dictionary: unknown, path: string) {
  return path.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, dictionary);
}

const SOURCES = [
  "src/renderer-react/src/features/desktop/SettingsPanel.tsx",
  "src/renderer-react/src/features/desktop/UpdateSection.tsx",
  "src/renderer-react/src/features/desktop/settings/ModelSettings.tsx",
  "src/renderer-react/src/features/desktop/settings/GeneralSettings.tsx",
  "src/renderer-react/src/features/desktop/settings/AboutSettings.tsx"
];

/** Keys the panel builds by interpolation, which the literal scan cannot see. */
const INTERPOLATED_KEYS = [
  "settings.tabs.model",
  "settings.tabs.general",
  "settings.tabs.about",
  "settings.tabDescriptions.model",
  "settings.tabDescriptions.general",
  "settings.tabDescriptions.about",
  "about.geogebraCredit",
  "about.gaokaoCredit",
  "about.conic10kCredit"
];

describe("react desktop settings i18n", () => {
  test("every settings key referenced by the panel exists in both locales", () => {
    const referenced = new Set<string>();
    for (const source of SOURCES) {
      const text = readFileSync(new URL(`../${source}`, import.meta.url), "utf8");
      for (const match of text.matchAll(/"((?:settings|about)\.[A-Za-z.]+)"/g)) referenced.add(match[1]!);
    }
    for (const key of INTERPOLATED_KEYS) referenced.add(key);
    expect(referenced.size).toBeGreaterThan(20);
    for (const key of referenced) {
      expect(typeof resolve(en, key), `${key} missing from en`).toBe("string");
      expect(typeof resolve(zhCN, key), `${key} missing from zh-CN`).toBe("string");
    }
  });

  test("the two locales carry the same settings and about keys", () => {
    expect(keyPaths(zhCN.settings).sort()).toEqual(keyPaths(en.settings).sort());
    expect(keyPaths(zhCN.about).sort()).toEqual(keyPaths(en.about).sort());
  });

  test("general settings keeps secondary logging controls behind the enabled state", () => {
    const source = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/settings/GeneralSettings.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("<SettingsDisclosure open={status.enabled}>");
    expect(source).toContain('className="settings-inline-controls settings-disclosure-controls"');
    expect(source).not.toContain("{status.logDirectory}");
  });

  test("all progressively revealed general settings use the shared disclosure motion", () => {
    const general = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/settings/GeneralSettings.tsx", import.meta.url),
      "utf8"
    );
    const update = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/UpdateSection.tsx", import.meta.url),
      "utf8"
    );
    const disclosure = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/settings/SettingsDisclosure.tsx", import.meta.url),
      "utf8"
    );
    expect(general.match(/<SettingsDisclosure /g)?.length).toBe(3);
    expect(update).toContain("<SettingsDisclosure open={!isLatest || downloading}>");
    expect(disclosure).toContain("<AnimatePresence initial={false}>");
    expect(disclosure).toContain('duration: 0.18');
    expect(disclosure).toContain("useReducedMotion()");
  });

  test("the compact update row checks explicitly instead of exposing the primary install action", () => {
    const source = readFileSync(
      new URL("../src/renderer-react/src/features/desktop/UpdateSection.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("update.check()");
    expect(source).toContain('t("settings.updateLatest", { version: currentVersion })');
    expect(source).not.toContain("update.runPrimaryAction()");
  });
});
