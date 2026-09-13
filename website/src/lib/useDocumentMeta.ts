import { useEffect } from "react";
import { useLocale } from "../i18n";
import { SEO, type RouteKey } from "../routes-meta";

/**
 * Keeps the tab title and description correct across client-side navigation.
 * The prerenderer writes the same values into the static HTML, so the first
 * paint is already correct and this only matters for in-app route changes.
 */
export function useDocumentMeta(key: RouteKey): void {
  const locale = useLocale();

  useEffect(() => {
    const meta = SEO[locale][key];
    document.title = meta.title;

    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    if (description) description.content = meta.description;

    document.documentElement.lang = locale === "zh" ? "zh-Hans" : "en";
  }, [locale, key]);
}
