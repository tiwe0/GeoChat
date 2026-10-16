# Website design record

## Scope and inherited direction

This document records the existing marketing website and the approved DSH
plugin extension. The root `DESIGN.md` describes the desktop workbench, not
this surface. No website design-system change is introduced by this update.

- **Ground and colour:** paper surfaces, ink text, construction blue and
  conclusion red; shared tokens remain in `src/styles/app.css`.
- **Type:** self-hosted Archivo for the main interface, Source Serif 4 where
  already used, and platform CJK fallbacks. Preserve the existing hierarchy.
- **Layout:** shared `Container`, drafting rules, restrained rounded controls
  and generous section spacing. Retain the desktop hero as the first section.
- **Media:** real product screenshots, full frame, with responsive local
  derivatives. Do not replace evidence with decorative mockups.

## DSH plugin extension — 2026-10-16

Approved direction: `DSH_PLUGIN_SURFACE.md`. The plugin section follows the
hero, then presents its actual screenshot, capabilities, versioned installation
command and explicit compatibility, lifecycle, coverage and licensing limits.
Two columns stack on narrow screens. Copy feedback is accessible and includes
a manual-copy fallback when clipboard access fails. No decorative motion,
new dependencies or global token changes were added.

### Shipping media provenance

Both derivatives originate from the user-selected screenshot
`docs/media/geochat-dsh-plugin.png` at commit
`57cfe15a66ce3d2a13c180f7166d91f6d2b5b78d`:

| Asset | Conversion | Provenance record |
| --- | --- | --- |
| `public/media/dsh-plugin-1600.webp` | Full frame, 1600 × 1072, cwebp q86 | Adjacent `.webp.json` |
| `public/media/dsh-plugin-960.webp` | Full frame, 960 × 643, cwebp q86 | Adjacent `.webp.json` |

No screenshot content was altered. Version and installation URLs are owned by
`src/site.ts`; plugin and desktop releases remain independent.

### Finish review and verification

A fresh-context independent reviewer substituted for the unavailable named
finish-reviewer role. All twelve local captures (full page and plugin section,
Chinese and English, at 1440, 390 and 360 CSS pixels) passed visual and factual
review. The only requested fix was this website-specific design record;
unchanged UI does not require recapture. A separate documenter verified the
inherited direction and both provenance sidecars.

Local checks passed: typecheck, 16 contrast pairs, production build, 30
prerender assertions with 14 required assets, and six browser smoke cases with
no horizontal overflow or page errors. Clipboard success and denied-access
paths were verified with browser mocks, not the system clipboard. These checks
do not establish deployment success or a new Harness runtime acceptance.
