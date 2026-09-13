import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { App } from "./App";
import { SEO, type MetaKey } from "./routes-meta";
import { SITE_NAME, SITE_URL } from "./site";
import type { Locale } from "./i18n/types";

export type RenderResult = {
  html: string;
  head: string;
  htmlLang: string;
};

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds the head for one route. Written as real tags into the static HTML so
 * share cards (WeChat and Twitter in particular never execute JavaScript) and
 * search crawlers see the correct metadata on first byte.
 */
function head(locale: Locale, key: MetaKey, url: string): string {
  const meta = SEO[locale][key];

  const tags = [
    `<title>${escapeAttribute(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(meta.description)}" />`
  ];

  // A 404 shell must not claim a canonical URL or appear in hreflang, or
  // crawlers will treat it as a real alternate of the pages it stands in for.
  // Absolute URLs need a configured origin; without one they are omitted
  // rather than guessed (check-prerender.mjs fails the build in that case).
  if (key === "notFound") {
    tags.push(`<meta name="robots" content="noindex" />`);
  } else if (SITE_URL) {
    const canonical = `${SITE_URL}${url === "/" ? "" : url}`;
    const zhPath = key === "home" ? "/" : `/${key}`;
    const enPath = key === "home" ? "/en" : `/en/${key}`;
    tags.push(
      `<link rel="canonical" href="${canonical}" />`,
      `<link rel="alternate" hreflang="zh-Hans" href="${SITE_URL}${zhPath}" />`,
      `<link rel="alternate" hreflang="en" href="${SITE_URL}${enPath}" />`,
      `<link rel="alternate" hreflang="x-default" href="${SITE_URL}${zhPath}" />`,
      `<meta property="og:url" content="${canonical}" />`
    );
  }

  tags.push(
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeAttribute(SITE_NAME)}" />`,
    `<meta property="og:locale" content="${locale === "zh" ? "zh_CN" : "en_US"}" />`,
    `<meta property="og:title" content="${escapeAttribute(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(meta.description)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttribute(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(meta.description)}" />`
  );

  // Share-card images must be absolute; a relative path is ignored by every
  // major crawler, so it is better to omit them than to ship a broken one.
  if (SITE_URL) {
    tags.push(
      `<meta property="og:image" content="${SITE_URL}/og.png" />`,
      `<meta name="twitter:image" content="${SITE_URL}/og.png" />`
    );
  }

  return tags.join("\n    ");
}

export function render(url: string, locale: Locale, key: MetaKey): RenderResult {
  const html = renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>
  );

  return {
    html,
    head: head(locale, key, url),
    htmlLang: locale === "zh" ? "zh-Hans" : "en"
  };
}

export { allRoutes } from "./routes-meta";
export { SITE_URL } from "./site";
