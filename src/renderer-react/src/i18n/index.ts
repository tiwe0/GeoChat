import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { createStructuredLogger } from "@geochat-ai/app/structured-logger";
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";
import { nativePreferences } from "../lib/nativePreferences";

const logger = createStructuredLogger("renderer.i18n");

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
    storedLanguage = nativePreferences().get(LANGUAGE_STORAGE_KEY);
  } catch (caughtError) {
    logger.debug("stored_language_read_failed", "I18N_LANGUAGE_READ_FAILED", { error: caughtError });
    // The machine language remains the fallback when no preference can be read.
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
    await nativePreferences().set(LANGUAGE_STORAGE_KEY, language);
  } catch (caughtError) {
    logger.debug("language_persist_failed", "I18N_LANGUAGE_PERSIST_FAILED", { error: caughtError, language });
    // Keep the in-memory selection even if persistence is unavailable.
  }
}

export default i18n;
