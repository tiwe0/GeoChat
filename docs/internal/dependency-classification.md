# Root dependency classification

> Audited: 2026-10-01, GeoChat v0.6.1

GeoChat is a private desktop application, not a published JavaScript package. Its release pipeline installs the complete
frozen lockfile, bundles the renderer with Vite, bundles the Bun backend into `backend.bundle.js`, and ships those outputs
as Tauri resources. The packaged application does not load a root `node_modules` directory at runtime.

For that reason, moving bundled libraries from `devDependencies` to `dependencies` would not change the shipped runtime
and would imply a Node package consumption model that this repository does not have. The current empty `dependencies`
section is intentional until a dependency is introduced that is loaded from `node_modules` after installation.

## Classification

| Class | Packages | Release treatment |
| --- | --- | --- |
| Renderer runtime, bundled by Vite | `@ai-sdk/react`, `@assistant-ui/react`, `@emotion/cache`, `@emotion/react`, `@emotion/styled`, `@fontsource-variable/noto-sans-sc`, `@fontsource-variable/nunito-sans`, `@mui/material`, `@streamdown/cjk`, `@streamdown/math`, `@tauri-apps/api`, `i18next`, `katex`, `lucide-react`, `motion`, `react`, `react-dom`, `react-i18next`, `react-joyride`, `shiki`, `streamdown` | Emitted into `dist/renderer` before Tauri packaging. |
| Backend runtime, bundled by Bun | `@ai-sdk/alibaba`, `@ai-sdk/anthropic`, `@ai-sdk/deepseek`, `@ai-sdk/google`, `@ai-sdk/openai`, `@modelcontextprotocol/sdk`, `@openrouter/ai-sdk-provider`, `ai`, `drizzle-orm`, `effect`, `zod` | Emitted into `dist/backend/backend.bundle.js`; the Bun runtime itself is staged separately. |
| Workspace source, bundled into consumers | `@geochat-ai/app` | Resolved from `packages/app` and bundled into the renderer/backend outputs. |
| Build, test, type, and packaging only | `@biomejs/biome`, `@tauri-apps/cli`, `@types/bun`, `@types/katex`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `drizzle-kit`, `typescript`, `vite` | Required only before packaging; never loaded by the installed app. |

## Change rule

A future package belongs in `dependencies` only if the installed application resolves it from a shipped `node_modules`
tree or if this root package becomes a published library consumed without the repository's build pipeline. Any such move
must be backed by a frozen install, renderer/backend build, Tauri package build, packaged backend smoke, and platform launch
smoke.

## Current verification

- `bun install --frozen-lockfile`
- `bun run tauri:prepare`
- `bun run tauri:build`
- `bun run tauri:package:smoke`
- `bun run package:backend-smoke`
- `bun run package:launch-smoke`

These checks prove the current classification for the produced macOS application. They do not prove Windows installer
installation or a future production-only JavaScript install mode.
