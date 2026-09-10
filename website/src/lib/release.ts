import { useEffect, useState } from "react";
import { DOWNLOADS_BASE, FALLBACK_VERSION, RELEASES_API, RELEASES_URL } from "../site";
import type { Platform } from "./platform";

export type AssetKind = "dmg" | "exe" | "msi";

export type ReleaseAsset = {
  name: string;
  url: string;
  size: number;
  platform: Platform;
  kind: AssetKind;
  /** Present only from the R2 manifest; the GitHub API does not publish one. */
  sha256?: string;
};

export type Release = {
  version: string;
  publishedAt: string | null;
  htmlUrl: string;
  assets: ReleaseAsset[];
  /** Which feed answered, so the UI can say when it is showing a fallback. */
  source: "mirror" | "github" | "fallback";
};

export type ReleaseState =
  | { status: "loading"; release: null }
  | { status: "ready"; release: Release }
  /** No feed answered; the page still names a version and links to Releases. */
  | { status: "error"; release: Release };

const CACHE_KEY = "geochat:latest-release";
const CACHE_TTL_MS = 10 * 60 * 1000;

const FALLBACK: Release = {
  version: FALLBACK_VERSION,
  publishedAt: null,
  htmlUrl: `${RELEASES_URL}/latest`,
  assets: [],
  source: "fallback"
};

/** Maps an asset filename to the platform and installer kind it serves. */
function classify(name: string): Pick<ReleaseAsset, "kind" | "platform"> | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".dmg")) return { kind: "dmg", platform: "macos" };
  if (lower.endsWith(".msi")) return { kind: "msi", platform: "windows" };
  if (lower.endsWith(".exe")) return { kind: "exe", platform: "windows" };
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/* ---- The R2 mirror manifest, written by .github/workflows/tauri-package.yml -- */

type MirrorAsset = {
  name?: unknown;
  url?: unknown;
  size?: unknown;
  sha256?: unknown;
};

function parseMirror(payload: unknown): Release | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as {
    version?: unknown;
    publishedAt?: unknown;
    releaseUrl?: unknown;
    assets?: unknown;
  };

  const version = asString(body.version);
  if (!version) return null;

  const rawAssets = Array.isArray(body.assets) ? (body.assets as MirrorAsset[]) : [];
  const assets: ReleaseAsset[] = [];
  for (const asset of rawAssets) {
    const name = asString(asset.name);
    const url = asString(asset.url);
    if (!name || !url) continue;
    const classified = classify(name);
    if (!classified) continue;
    const sha256 = asString((asset as { sha256?: unknown }).sha256);
    assets.push({
      name,
      url,
      size: typeof asset.size === "number" ? asset.size : 0,
      ...classified,
      ...(sha256 ? { sha256 } : {})
    });
  }

  if (assets.length === 0) return null;

  return {
    version: version.replace(/^v/, ""),
    publishedAt: asString(body.publishedAt),
    htmlUrl: asString(body.releaseUrl) ?? `${RELEASES_URL}/tag/v${version}`,
    assets,
    source: "mirror"
  };
}

/* ---- The GitHub Releases API, used when the mirror is unavailable --------- */

type GithubAsset = {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
};

function parseGithub(payload: unknown): Release | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as {
    tag_name?: unknown;
    published_at?: unknown;
    html_url?: unknown;
    assets?: unknown;
  };

  const tag = asString(body.tag_name);
  if (!tag) return null;

  const rawAssets = Array.isArray(body.assets) ? (body.assets as GithubAsset[]) : [];
  const assets: ReleaseAsset[] = [];
  for (const asset of rawAssets) {
    const name = asString(asset.name);
    const url = asString(asset.browser_download_url);
    if (!name || !url) continue;
    const classified = classify(name);
    if (!classified) continue;
    assets.push({
      name,
      url,
      size: typeof asset.size === "number" ? asset.size : 0,
      ...classified
    });
  }

  return {
    version: tag.replace(/^v/, ""),
    publishedAt: asString(body.published_at),
    htmlUrl: asString(body.html_url) ?? FALLBACK.htmlUrl,
    assets,
    source: "github"
  };
}

/* ---- Caching -------------------------------------------------------------- */

function readCache(): Release | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { at: number; release: Release };
    if (Date.now() - entry.at > CACHE_TTL_MS) return null;
    return entry.release;
  } catch {
    // Private windows and blocked site data both throw here. Not an error.
    return null;
  }
}

function writeCache(release: Release): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release }));
  } catch {
    // Caching is an optimization; failing to cache must not fail the page.
  }
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

/**
 * Tries the R2 mirror first, then the GitHub API. Either one succeeding is
 * enough; only if both fail does the page fall back to the baked-in version.
 */
export function useLatestRelease(): ReleaseState {
  const [state, setState] = useState<ReleaseState>({ status: "loading", release: null });

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setState({ status: "ready", release: cached });
      return;
    }

    const controller = new AbortController();
    let alive = true;

    (async () => {
      if (DOWNLOADS_BASE) {
        try {
          const payload = await fetchJson(
            `${DOWNLOADS_BASE}/latest.json`,
            controller.signal
          );
          const release = parseMirror(payload);
          if (release) {
            if (!alive) return;
            writeCache(release);
            setState({ status: "ready", release });
            return;
          }
        } catch {
          // Mirror not configured yet, or unreachable. Fall through to GitHub.
        }
      }

      try {
        const payload = await fetchJson(RELEASES_API, controller.signal);
        const release = parseGithub(payload);
        if (!release) throw new Error("Unexpected release payload");
        if (!alive) return;
        writeCache(release);
        setState({ status: "ready", release });
      } catch {
        if (!alive) return;
        setState({ status: "error", release: FALLBACK });
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  return state;
}

export function assetsFor(release: Release, platform: Platform): ReleaseAsset[] {
  return release.assets.filter((asset) => asset.platform === platform);
}
