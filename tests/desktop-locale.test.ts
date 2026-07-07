import { describe, expect, test } from "bun:test";
import { normalizeDesktopConfig } from "../src/renderer/src/desktop-config";
import { detectPreferredLocale, localeFromLanguageTag, rendererI18n } from "../src/renderer/src/i18n";

describe("desktop locale defaults", () => {
  test("maps browser language tags onto supported locales", () => {
    expect(localeFromLanguageTag("zh-CN")).toBe("zh-CN");
    expect(localeFromLanguageTag("zh_Hant_TW")).toBe("zh-CN");
    expect(localeFromLanguageTag("en-GB")).toBe("en-US");
    expect(localeFromLanguageTag("fr-FR")).toBeNull();
  });

  test("uses the first supported machine language preference", () => {
    expect(detectPreferredLocale(["fr-FR", "zh-CN", "en-US"])).toBe("zh-CN");
    expect(detectPreferredLocale(["en-US", "zh-CN"])).toBe("en-US");
    expect(detectPreferredLocale(["fr-FR"])).toBe("en-US");
  });

  test("applies machine language only when no saved locale exists", () => {
    expect(normalizeDesktopConfig({}, "en-US").locale).toBe("en-US");
    expect(normalizeDesktopConfig({ locale: "zh-CN" }, "en-US").locale).toBe("zh-CN");
  });

  test("keeps locale copy key shapes in parity", () => {
    expect(copyShape(rendererI18n("en-US"))).toEqual(copyShape(rendererI18n("zh-CN")));
  });
});

function copyShape(value: unknown): unknown {
  if (!value || typeof value !== "object") return typeof value;
  if (Array.isArray(value)) return value.map(copyShape);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, copyShape(child)])
  );
}
