import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";

export const LANGUAGE_STORAGE_KEY = "geogebraCopilotLanguage";
export const APP_LANGUAGES = ["zh-CN", "en"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export function resolveAppLanguage(value: unknown): AppLanguage {
  return typeof value === "string" && value.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export async function initializeI18n(_apiOrigin?: string) {
  if (i18n.isInitialized) return i18n;

  let storedLanguage: unknown;
  try {
    const stored = await browser.storage.local.get(LANGUAGE_STORAGE_KEY);
    storedLanguage = stored[LANGUAGE_STORAGE_KEY];
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/i18n/index.ts:21", caughtError);
    // Browser language remains the fallback when extension storage is unavailable.
  }

  const initialLanguage = resolveAppLanguage(storedLanguage ?? navigator.language);

  await i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        "zh-CN": { translation: zhCN },
      },
      lng: initialLanguage,
      fallbackLng: "en",
      supportedLngs: APP_LANGUAGES,
      load: "currentOnly",
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      returnNull: false,
    });

  return i18n;
}

export async function changeAppLanguage(language: AppLanguage) {
  await i18n.changeLanguage(language);
  try {
    await browser.storage.local.set({ [LANGUAGE_STORAGE_KEY]: language });
  } catch (caughtError) {
    console.error("[ERROR] Caught exception at src/renderer-react/src/i18n/index.ts:50", caughtError);
    // Keep the in-memory selection even if persistence is unavailable.
  }
}

export default i18n;
