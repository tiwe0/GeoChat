# GeoChat website

The marketing site for GeoChat Desktop. Static, bilingual (Chinese at `/`,
English at `/en`), prerendered to real HTML, no analytics and no backend.

It is a standalone Vite app and deliberately **not** part of the root Bun
workspace, so the desktop app's dependency tree and this one stay separate.

```sh
cd website
bun install
bun run dev          # http://localhost:5173
```

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Vite dev server. Client-rendered; no prerendering. |
| `bun run build` | Syncs the fallback version, builds client + SSR bundles, prerenders every route, writes `sitemap.xml`, `robots.txt` and `_headers`. |
| `bun run serve` | Serves `dist/` **the way Cloudflare Pages does**. Use this to verify a build. |
| `bun run typecheck` | `tsc --noEmit`. |
| `bun run check:contrast` | Asserts every shipped colour pair meets WCAG AA. |
| `node scripts/check-prerender.mjs` | Asserts `dist/` really contains prerendered content and required assets. |
| `node scripts/generate-og.mjs` | Re-renders `public/og.png` from `scripts/og.html`. |

### Do not verify with `vite preview`

`vite preview` applies an SPA fallback: it answers `/privacy` with the root
`index.html` — the prerendered *home* page — instead of `dist/privacy/index.html`.
That produces a React hydration mismatch locally which cannot happen in
production, and it masks real prerender bugs behind a fake one. `bun run serve`
resolves paths the way Pages does (exact file → `<path>/index.html` → `404.html`).

## Build-time configuration

Deployment hosts are **not committed**. This is a public repository and
`OPEN_SOURCE.md` keeps account identifiers and deployment state out of it, so
real values live in Cloudflare Pages and GitHub Actions variables.

| Variable | Required | Effect when unset |
| --- | --- | --- |
| `VITE_SITE_URL` | For production | No canonical, hreflang, `og:url`, `og:image` or sitemap. `check-prerender.mjs` fails, so a production build cannot ship without it. |
| `VITE_DOWNLOADS_BASE` | Optional | The download page skips the installer mirror and reads the GitHub Releases API directly. |

Both are plain origins with no trailing slash, e.g.
`VITE_SITE_URL=https://example.com` and
`VITE_DOWNLOADS_BASE=https://downloads.example.com/geochat`.

`public/_headers` is not committed either: `scripts/write-headers.mjs`
generates `dist/_headers` at build time so the CSP's `connect-src` names
exactly the mirror the bundle was built against. The policy and the code can
therefore never disagree about where downloads come from.

## Architecture notes

- **Prerendering.** `scripts/prerender.mjs` renders each route with
  `react-dom/server` and injects it into the built shell, so every page ships
  real HTML with its own `<title>`, description, canonical and hreflang. This is
  not optional: WeChat and Twitter do not execute JavaScript when building a
  share card, so a client-only SPA shares as a blank page.
- **Figures.** `src/components/figures/` renders geometry authored in
  mathematical coordinates. The hero uses the same triangle, circumcentre and
  radius as the GeoGebra commands printed beside it in the pipeline section.
  Figures render **complete** by default and the animation removes and replays
  that finished state after hydration, so static HTML, a no-JS browser and a
  headless screenshot all show a valid figure.
- **Colour is notation.** Three colours carry fixed meanings everywhere on the
  site: ink = given, blue = construction in progress, red = concluded.
  `scripts/check-contrast.mjs` reads the tokens straight out of
  `src/styles/app.css` and fails if any shipped pair drops below AA.
- **Fonts are self-hosted.** Google Fonts is unreachable from mainland China,
  which is this product's primary audience, so nothing may load from
  `fonts.googleapis.com`. Latin subsets only (54 KB total); CJK uses the
  platform stack.
- **No tracking.** No analytics, no cookies, no third-party scripts. The
  privacy page says so, and the generated CSP enforces it.

## Deployment

`.github/workflows/website.yml` builds and pushes to Cloudflare Pages:
production on push to `master`, a preview deployment for every pull request.
Both are path-filtered to `website/**`, so copy changes never trigger a Tauri
build and Rust changes never redeploy the site.

Required GitHub secrets (Settings → Secrets and variables → Actions):

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Needs **Cloudflare Pages: Edit**, plus **Workers R2 Storage: Edit** for installer mirroring. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID. |

Repository variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SITE_URL` | — | Canonical origin, passed to the build as `VITE_SITE_URL`. |
| `CLOUDFLARE_PAGES_PROJECT` | `geochat` | Pages project name. |
| `DOWNLOADS_BASE_URL` | — | Public base of the installer mirror. Mirroring is skipped if unset. |
| `R2_BUCKET` | — | R2 bucket for installers. Mirroring is skipped if unset. |
| `R2_PREFIX` | `geochat` | Key prefix inside the bucket. |

### Installer mirroring

The `mirror` job in `.github/workflows/tauri-package.yml` runs on `v*` tags
after the GitHub Release is published. It uploads each `.dmg` / `.exe` / `.msi`
to `<bucket>/<prefix>/<tag>/` (immutable, cached a year), then overwrites
`<bucket>/<prefix>/latest.json` (cached 5 minutes, written last so it never
points at objects that are not there yet).

The download page reads `latest.json` first and falls back to the GitHub
Releases API, then to the version baked in at build time. GitHub's
unauthenticated API is rate-limited per client IP, so visitors behind a busy
NAT hit a 403 — the mirror removes that failure mode and is much faster from
mainland China. GitHub Releases stays the source of truth: if R2 is not
configured the job logs a notice and skips, and the site works unchanged.

`latest.json` also carries a SHA-256 per installer, which the download page
shows. The installers are not code-signed, so a checksum is the only integrity
check a cautious user can perform.

## Regenerating media

Everything in `public/media/` and `public/og.png` is a committed build output,
not generated during `bun run build`. They were produced from `docs/media/`
with `ffmpeg` and `cwebp`.

One trap worth recording: in `docs/media/` the **Chinese**-UI recording is the
file named `geochat-desktop-demo-en.mp4`, and the **English**-UI one is
`geochat-desktop-demo-1080p.mp4` — the source filenames are inverted. The
Chinese recording holds a fixed window position and is cropped to it; the
English one zooms and pans, so it is left uncropped and the two therefore have
different aspect ratios (handled per locale in `src/sections/Media.tsx`).
