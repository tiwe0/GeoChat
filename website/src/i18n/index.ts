import { createContext, useContext } from "react";
import type { Content, Locale } from "./types";
import { zh } from "./zh";
import { en } from "./en";

export type { Content, Locale, SellingPoint, PipelineStep } from "./types";

export const content: Record<Locale, Content> = { zh, en };

export const LOCALES: Locale[] = ["zh", "en"];
export const DEFAULT_LOCALE: Locale = "zh";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
export const LocaleProvider = LocaleContext.Provider;

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useContent(): Content {
  return content[useLocale()];
}

/**
 * Chinese lives at the root, English under /en. Keeping the default locale
 * unprefixed avoids a redirect hop for the majority of visitors.
 */
export function localePath(locale: Locale, path = "/"): string {
  const clean = path === "/" ? "" : path.replace(/^\/+/, "");
  if (locale === DEFAULT_LOCALE) return `/${clean}`;
  return clean ? `/en/${clean}` : "/en";
}

/** Splits a pathname into its locale and the locale-independent remainder. */
export function parsePath(pathname: string): { locale: Locale; rest: string } {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed === "/en" || trimmed.startsWith("/en/")) {
    return { locale: "en", rest: trimmed.slice(3) || "/" };
  }
  return { locale: DEFAULT_LOCALE, rest: trimmed };
}

/** Replaces `{name}` placeholders. Keeps copy readable in the locale files. */
export function fill(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
