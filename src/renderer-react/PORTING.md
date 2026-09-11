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

1. **Shared package.** Imports still point at `@geogebra-copilot/shared/{contracts,client,blackboard,geogebra-protocol,model-registry}`.
   22 of the 33 symbols already exist in `@geochat-ai/app`; the 11 that do not:

   - Portable, need porting: `AgentRunThinkingEffort`, `ChatMessageMetadata`,
     `ChatTokenUsage`, `MAX_AGENT_ATTACHMENT_BYTES`,
     `MAX_AGENT_ATTACHMENT_COUNT`, `MAX_AGENT_ATTACHMENTS_TOTAL_BYTES`
   - Hosted-only, should be dropped or replaced with the local model registry:
     `AiModelId`, `DEFAULT_AI_MODEL_ID`, `PLATFORM_MODEL_CATALOG`,
     `createAgentRunRunnerClaimOwner`, `getNativeToolNameForHarnessTool`

   `@geochat-ai/app` needs subpath exports to match the import shape.

2. **Desktop layer** (~1227 lines in the Solid renderer, no React counterpart):
   `tauri-bridge`, window controls, `desktop-config` (BYOK key storage),
   sidecar lifecycle, `platform`, access state. This is new construction and
   should be done immediately after the web path runs, not last — it decides
   whether the thing works as a desktop app at all.

3. **Business surfaces to rebuild**: settings (rebuilt to the audited 4-tab
   shape, not ported as-is), problem bank (795 lines), improvement plan (258),
   update panels.

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
