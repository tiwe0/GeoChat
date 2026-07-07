# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-21
- Primary product surfaces: Tauri desktop workbench, GeoGebra canvas, floating AI chat panel, problem-bank browser, local settings dialog, update panels, sponsor/about page.
- Evidence reviewed: `README.md`, `docs/current-project-state.md`, `docs/product-design-optimization-plan.md`, `src/renderer/src/WorkbenchApp.tsx`, `src/renderer/src/ProblemBankPage.tsx`, `src/renderer/src/ConfigDialog.tsx`, `src/renderer/src/styles.css`.

## Brand
- Personality: quiet, precise, lightweight, mathematically focused.
- Trust signals: local-first desktop runtime, visible GeoGebra canvas state, restrained system UI, clear status chips.
- Avoid: heavy glassmorphism, large decorative gradients, nested card stacks, marketing-page weight inside the workbench, oversized shadows.

## Product goals
- Goals: make GeoGebra the primary workspace; keep AI chat immediately available without dominating; expose local model/config tools cleanly.
- Non-goals: account-centric SaaS UX, promotional landing page, decorative visual showcase.
- Success signals: the canvas reads first, chat feels movable and calm, settings feel like a native utility panel, QR/sponsor content is clear without visual noise.

## Personas and jobs
- Primary personas: desktop user exploring math problems, developer testing AI function calls, educator preparing visual explanations.
- User jobs: input a math problem, browse a configured problem bank, execute GeoGebra commands, inspect canvas state, adjust local model/UI/settings choices, export `.ggb`.
- Key contexts of use: long desktop sessions, repeated scanning between canvas and chat, local backend/app runtime debugging.

## Information architecture
- Primary navigation: top bar with workbench views and concise runtime status.
- Core routes/screens: chat workbench, problem-bank browser, blackboard/settings dialog, sponsor/about surface.
- Content hierarchy: canvas first, floating chat second, status/config controls third.
- Settings dialog IA: use a left sidebar for modules and a right detail pane for the selected module. Model, Skills, MCP, Tasks, About, Credits, and Debug are peer modules. Keep internal developer/debug controls under Debug, not mixed into user task history. Put future Agent skill and MCP configuration behind their own sidebar modules, even while they are still in development.

## Design principles
- Principle 1: Canvas-first calm. UI overlays should frame the canvas, not compete with it.
- Principle 2: Desktop utility over web landing. Prefer crisp controls, thin borders, low elevation, and compact copy.
- Tradeoffs: keep enough contrast for status and active controls while reducing saturated color and deep shadow.

## Visual language
- Color: near-white surfaces, graphite text, muted blue as the only primary action accent, soft green for healthy runtime.
- Typography: system sans, compact hierarchy, no viewport-scaled type.
- Spacing/layout rhythm: 8px base rhythm with dense but breathable controls.
- Shape/radius/elevation: 10-14px controls, 16px movable/modal surfaces, shadows below 10% opacity; persistent canvas-adjacent surfaces use solid fills, reserving blur for shallow modal dimming only.
- Motion: simple state transitions only when added; no ambient animation.
- Imagery/iconography: lucide icons in controls; real QR image only where sponsor content needs it.

### Settings Visual Language
- Layout: the settings dialog is a utility panel with a fixed header/footer, a left module sidebar, and a scrollable right content pane. On desktop the sidebar is vertical and the Debug module sits at the bottom; on narrow screens the sidebar becomes a horizontal tab strip and Debug rejoins the normal tab flow.
- Cards: repeated configuration groups use `SectionCard`. Short peer cards may sit in a two-column grid; long or primary sections span the full width with `config-card-wide`. Do not force equal heights across unlike content. Give compact summary cards a dedicated class and opt out of generic card `min-height` when their content is intentionally short.
- Module headers: settings summary cards use the MCP page pattern: `config-module-card` + `mcp-setting` + `mcp-setting-main`, with the icon/title and body copy on the left and status or action on the right. Do not introduce a one-off header wrapper for Tasks or other modules.
- Configuration modules: module detail pages such as Skills, MCP, and Debug use `config-module-card` so they share the same card sizing and spacing. Incomplete modules say "开发中" / "In development" inside the card, not "占位", "未配置", or disabled/error language.
- Collapsible model sections: model, vision, and advanced endpoint settings use `config-collapsible-card`. The summary row contains an icon, title, one-line helper text, and a chevron. Collapsed sections should shrink to the summary row; do not leave empty vertical space below them.
- Capability status: capability cards use semantic status color plus an icon. Ready is soft green; blocked is soft red. The circular status icon inherits the card status color and renders the check or X in white so it remains visible. Capability copy should explain the actual runtime consequence, not just repeat the label.
- Status pills: use `status-pill` variants consistently. Green means active/healthy, yellow means checking/available/in development, red means blocked/error/disabled. Do not use red disabled styling for a feature that is merely under development.
- Developer controls: local debug surfaces and internal MCP inspection controls belong under Debug. Product-facing MCP configuration means Agent-calling-external-MCP capability and belongs under the MCP module.
- About page: use a 2x2 information layout. Top row is Project on the left and Author on the right; bottom row is Update on the left and Improvement Plan on the right. Update information stays compact: show current version, update availability, and one primary update action instead of exposing every shell/app-bundle track and auto-update preference on this page.
- Copy: settings microcopy should be direct and operational. Prefer "开发中" for unfinished product modules, "本机调试 MCP" for internal debug MCP, and "MCP" for the product module. Avoid implementation placeholders becoming user-facing labels.

## Components
- Existing components to reuse: `IconButton`, `FloatingChatPanel`, `ConfigDialog`, `ProblemBankPage`, `SponsorPage`, `SectionCard`, `BlackboardPanel`.
- New/changed components: no new component layer; restyle existing components. Settings-specific classes include `config-card-wide`, `config-collapsible-card`, `config-module-card`, `config-module-note`, and `config-capability-status`.
- Variants and states: active nav, online/offline chips, disabled tools, loading/error diagnostics, capability ready/blocked, and development-state pills.
- Token/component ownership: `src/renderer/src/styles.css` owns visual tokens and component styling.

## Accessibility
- Target standard: pragmatic WCAG AA contrast for text and controls.
- Keyboard/focus behavior: native controls stay reachable; icon buttons require titles.
- Contrast/readability: avoid low-contrast glass overlays over canvas; use solid or near-solid panels.
- Screen-reader semantics: keep button labels/titles meaningful.
- Reduced motion and sensory considerations: no decorative animation.

## Responsive behavior
- Supported breakpoints/devices: desktop primary, narrow fallback down to 360px.
- Layout adaptations: top bar compresses, panel remains bounded, dialogs collapse to single column.
- Touch/hover differences: hover is optional; controls must remain visible without hover.

## Interaction states
- Loading: short centered diagnostic panel with concrete resource status.
- Empty: welcome card in chat, visually quiet.
- Error: explicit text with light red/orange treatment, not full-page alarm styling.
- Success: green status chips and ready labels.
- Disabled: reduced opacity only; layout must not shift.
- In development: yellow status pill, clear "开发中" copy, no disabled/error color unless the user attempted an unavailable action.
- Offline/slow network, if applicable: status chip and diagnostics show backend/applet state.

## Content voice
- Tone: direct, local-first, tool-like.
- Terminology: "本机", "本地 Bun runtime", "GeoGebra 画板", "配置中心".
- Microcopy rules: no account/cloud sync language; avoid marketing claims inside the workbench.

## Implementation constraints
- Framework/styling system: SolidJS renderer with plain CSS.
- Design-token constraints: define colors/shadows/radii in `:root`; avoid new design-system dependency.
- Performance constraints: keep CSS simple; avoid expensive backdrop blur except shallow modal dimming.
- Compatibility constraints: Tauri/Vite local assets, GeoGebra iframe/canvas must remain visible.
- Test/screenshot expectations: run `bun run build`; use Browser screenshot for workbench/settings/sponsor after significant visual changes.

## Open questions
- [ ] Final brand wordmark and icon asset / owner: product / impact: current `G` mark is a placeholder.
