# React renderer port — working notes

The React frontend from `geogebra copilot` lands here while the SolidJS
renderer in `src/renderer/` remains the shipping one. Nothing in this
directory is wired into a build yet.

## What was removed on the way in

The web build is an account-based hosted product. These surfaces were excluded
because `OPEN_SOURCE.md` keeps hosted service implementations out of this
repository, and because sign-in and billing belong to the Pro build:

| Removed | Lines |
| --- | --- |
| `features/auth` | 370 |
| `features/billing` | 243 |
| `features/bridge` (cloud device pairing) | 342 |
| `LoginPage` / `UserPage` / `UserAvatar` | 557 |

`features/local-session` replaces the account session with a local-only stand-in.
It keeps the `authSessionRef` shape because the panel threads it through every
backend call, and the local Bun backend does accept an optional shared token
(`GEOCHAT_DESKTOP_LOCAL_AUTH_TOKEN`).

The `panelView === "user"` slot was kept on purpose and now renders a
placeholder: it is where desktop Settings should live, which also answers the
audit finding that Settings is currently reachable only through an unlabelled
overflow menu.

## Remaining work

1. ~~**Shared package.**~~ Done. `@geochat-ai/app` gained subpath exports
   (`/contracts`, `/client`, `/blackboard`, `/geogebra-protocol`,
   `/model-registry`, `/chat`) as barrels over existing modules, and every
   import here points at them. Six symbols were ported (`ChatTokenUsage`,
   `ChatMessageMetadata`, the three attachment limits, `AgentRunThinkingEffort`)
   plus `createAgentRunRunnerClaimOwner`, whose `claimOwner` value the backend
   already accepted but had no builder for. The hosted ones were replaced:
   the model catalog now reads the local `AGENT_MODEL_REGISTRY` instead of
   fetching `/api/models`, `AiModelId` became `string` because model ids are
   open-ended under bring-your-own-key, and the native-host tool gate went
   away because this build executes tools in-process. Market routing and the
   `web-geochatpro` client channel are gone.

2. **Desktop layer.** Mostly done, and far cheaper than estimated: the bridge
   installs `window.geochatDesktop`, a plain global, and most of the layer
   turned out to be framework-agnostic already. Moved to `src/shared/desktop/`
   and now consumed by both renderers:

   `tauri-bridge` (288), `desktop-config` (365), `improvement-plan` (258),
   `problem-bank-cache` (199), `workbench-types` (98), `workbench-desktop-runtime`
   (53), `platform` (27), `run-cancellation` (16), `desktop-window-controls` (12),
   plus `locale` split out of the renderer's i18n so shared code can name a
   locale without pulling in translation dictionaries.

   Two exceptions:
   - `workbench-backend-runner` (435) stayed with the Solid renderer. It reaches
     into twelve renderer modules, so it is renderer orchestration rather than a
     desktop primitive, and needs a React rewrite.
   - Access state was genuinely reactive, so it has a React hook at
     `features/desktop/useAccessState.ts` with identical behaviour.

   `tests/renderer-global-boundaries.test.ts` was widened to scan
   `src/shared/desktop` as well. It enforces that direct Tauri/global access
   stays in a documented, line-capped allowlist, and scanning only the renderer
   would have quietly stopped enforcing that on the very files it exists for.

3. **Business surfaces.** Scope narrowed after the desktop's role was settled
   (free tier: local problem entry on the desktop; Pro: cloud conversation
   storage and miniprogram linkage, with the desktop as the drawing surface):

   - Settings: still to build, and deliberately minimal — provider, model, key.
     The audited 4-tab shape is already more than this build needs.
   - Problem bank, improvement plan: **not ported.** They belong to Pro.
   - Bridge receiver: to add, default off. `features/bridge` in the web build is
     the device-pairing and task-claiming mechanism behind "photograph a problem
     on the phone, draw it on the desktop", so the desktop needs the receiving
     half. The sending half and its account surface stay in Pro.
   - Brand: user-visible strings now say GeoChat. Internal identifiers
     (`data-copilot-tour`, `copilot-markdown`, storage keys, theme names) were
     left alone; renaming them would churn selectors, CSS classes and persisted
     localStorage keys for no user-facing gain.

   Two things that looked like defects and are not, both confirmed by
   measurement rather than assumption:
   - The grey rectangle over the canvas in headless screenshots is
     react-joyride's spotlight scrim, not a canvas sizing bug. Host, applet and
     canvas all measure correctly (1440x900 / 1438x898), and the region hits a
     947x598 SVG `path` that disappears once the tour is dismissed.
   - `workbench-backend-runner` needs no port; the React feature set already has
     the equivalent loop and interrupted-run recovery.

4. **Cut over**: point `vite.tauri.config.ts` at this renderer, run the full
   acceptance set, then delete `src/renderer/` and drop solid-js,
   @kobalte/core and lucide-solid.

## Notes

- `platform-web.ts` maps `browser.storage.local` onto `localStorage`, so the
  WebExtension storage calls inherited from the extension build work unchanged
  in a Tauri webview.
- The web build self-hosts its fonts via `@fontsource-variable`, which removes
  the current renderer's bug of naming Inter first and never loading it.
- MUI + Emotion replaces 5511 lines of `styles.css`. The existing visual
  language (hairline borders, semantic state colours, the named z-index scale)
  has to be re-expressed as an MUI theme or it will default to stock MUI.
