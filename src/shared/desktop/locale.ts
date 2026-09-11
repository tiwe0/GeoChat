/**
 * Locale identity and preference detection.
 *
 * Split out of the renderer's i18n module so that code shared between
 * renderers (desktop config, improvement plan) can name a locale without
 * pulling in a renderer's translation dictionaries.
 */
export type Locale = "zh-CN" | "en-US";

export function localeFromLanguageTag(language?: string | null): Locale | null {
  const normalized = language?.trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) return null;
  const [base] = normalized.split("-");
  if (base === "zh") return "zh-CN";
  if (base === "en") return "en-US";
  return null;
}

function browserLanguagePreferences(): string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages?.length) return [...navigator.languages];
  return navigator.language ? [navigator.language] : [];
}

export function detectPreferredLocale(languages: readonly string[] = browserLanguagePreferences()): Locale {
  for (const language of languages) {
    const locale = localeFromLanguageTag(language);
    if (locale) return locale;
  }
  return "en-US";
}
