/**
 * Site-wide constants. Everything that would otherwise be a magic string
 * scattered through components lives here.
 *
 * Deployment-specific values (canonical origin, installer mirror host) are
 * read from build-time environment variables rather than committed. This is a
 * public repository, and OPEN_SOURCE.md keeps account identifiers and
 * deployment state out of it — so the real hosts are configured in Cloudflare
 * Pages and GitHub Actions variables, not here. See website/README.md.
 */

export const REPO_OWNER = "tiwe0";
export const REPO_NAME = "GeoChat";
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
export const RELEASES_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
export const ACTIONS_URL = `${REPO_URL}/actions`;

/**
 * Public contact for the privacy policy and terms. Already published as the
 * author address in the repository README, and a legal contact point has to be
 * reachable, so this one is deliberately in the clear.
 */
export const CONTACT_EMAIL = "contact@ivory.cafe";

/**
 * Baked in at build time so the download page can name a version even when no
 * release feed is reachable. Kept in sync with the desktop app's
 * package.json version by scripts/sync-version.mjs, which runs from `build`.
 */
export const FALLBACK_VERSION = "0.6.0";

export const SITE_NAME = "GeoChat Desktop";

/**
 * Canonical origin, e.g. "https://example.com" with no trailing slash.
 *
 * Set `VITE_SITE_URL` at build time. When it is empty the prerenderer emits no
 * canonical, hreflang, og:url or sitemap — correct for a local build, and
 * scripts/check-prerender.mjs fails on it so a production build can never ship
 * without one by accident.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "").replace(/\/+$/, "");

/**
 * Public base for installers mirrored to Cloudflare R2 by the release
 * workflow, e.g. "https://downloads.example.com/geochat".
 *
 * The download page reads `<base>/latest.json` in preference to the GitHub API:
 * it is much faster from mainland China and is not subject to GitHub's
 * unauthenticated rate limit. Leave `VITE_DOWNLOADS_BASE` unset to skip the
 * mirror entirely and use the GitHub API alone.
 */
export const DOWNLOADS_BASE = (import.meta.env.VITE_DOWNLOADS_BASE ?? "").replace(
  /\/+$/,
  ""
);
