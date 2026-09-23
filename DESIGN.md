# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-09-23
- Primary product surfaces: Tauri desktop workbench, GeoGebra canvas, floating AI chat panel, problem-bank browser, settings dialog, update controls, sponsor/about page.
- Evidence reviewed: current source-dev settings screenshot, `src/renderer-react/src/components/AssistantPanel.tsx`, `src/renderer-react/src/features/desktop/SettingsPanel.tsx`, `src/renderer-react/src/features/desktop/settings/ProblemBankSettings.tsx`, `src/renderer-react/src/features/desktop/settings/problemBankApi.ts`, `packages/app/src/problem-bank.ts`, and `docs/problem-bank-versioned-cache-design.md`.
- Supporting feature brief: `docs/problem-bank-ui-interaction-plan.md`.

## Brand
- Personality: quiet, precise, lightweight, mathematically focused.
- Trust signals: canvas-first composition, restrained native-utility styling, explicit local/cloud source labels, visible cache and license state, reversible actions.
- Avoid: heavy glassmorphism, decorative gradients, nested card stacks, dashboard density, promotional copy inside the workbench, and controls that silently trigger AI or canvas writes.

## Product goals
- Goals: keep GeoGebra as the primary workspace; make problem discovery and reuse fast; keep model, cache, and app configuration understandable; preserve work when moving between chat, settings, and the problem bank.
- Non-goals: account-centric SaaS navigation, a full learning-management system, a web-store catalog, or automatic submission of a selected problem to the model.
- Success signals: users can identify the active problem-bank version, browse cached content offline, find a problem with a few filters, preview its provenance and reuse policy, then deliberately bring it into the current conversation without losing canvas or draft state.

## Personas and jobs
- Primary personas: learner exploring a geometry problem, educator selecting a visual example, developer validating AI tool calls and datasets.
- User jobs: find a suitable problem, inspect prompt/media/answer metadata, send a problem to chat, analyze it on the canvas, manage local/cloud cache, execute GeoGebra commands, and export `.ggb` work.
- Key contexts of use: long desktop sessions, repeated scanning between canvas and the floating panel, intermittent network access, and local runtime debugging.

## Information architecture
- Primary hierarchy: GeoGebra canvas first, floating assistant second, transient drawers and configuration third.
- Assistant views: `chat` and `settings`. Conversation, composer draft, attachments, canvas, panel position, and panel size remain intact when changing views.
- Chat header actions: history/title, new conversation, blackboard, problem bank, language, settings, minimize. The problem-bank entry is a visible icon button with a tooltip, not hidden inside settings.
- Problem-bank browser: an animated companion card opens immediately to the right of the chat panel, stays equal to the panel height, scrolls independently, and can be retracted from either the header trigger or its close button. On constrained widths it becomes a right-edge overlay rather than forcing the whole workspace off-screen.
- Problem-bank navigation inside the companion card is catalog -> filtered results -> problem detail. Back first returns from detail to results; closing the card returns focus to its chat-header trigger.
- Settings modules: Model, Problem Bank, General, About. The Problem Bank module manages sources, versions, sync, and per-bank downloads; General owns shared local storage controls such as the problem-bank cache directory and cache clearing. Settings do not become the browsing surface.
- Source model: local built-in sets and the active cloud release appear in one catalog, but every bank/problem keeps an explicit source badge and release/provenance metadata.

### Problem-bank experience
- Problem Bank settings: one compact summary row shows availability and total entries. Source rows expose local reindexing, cloud metadata sync, per-bank offline status, and resumable downloads.
- General settings: the problem-bank cache row shows total cache size and directory, with right-aligned open-folder and clear-cache actions.
- Browser catalog: bank cards show title, source, problem count, media count, access tier, reuse policy, and offline availability. Reuse policy must not be inferred from public readability.
- Results: persistent search field, compact filter button/chips, result count, and virtualizable result rows. Initial facets are dataset, grade, construction, modality, and media presence.
- Detail: prompt and media are primary; answer/analysis is collapsed by default; dataset, release, license, and reuse policy remain visible. Restricted or unknown reuse receives a neutral warning before any downstream action.
- Handoff: `发送到对话` returns to chat and pre-fills the composer with a structured problem reference plus readable prompt. It never auto-sends. `在画板中分析` also returns to chat with a canvas-analysis instruction; it never mutates GeoGebra before the user submits.
- Offline behavior: continue showing the active verified cache, mark stale data without blocking it, disable only network-dependent actions, and provide one retry control.

## Design principles
- Canvas-first calm: overlays frame the mathematical workspace instead of competing with it.
- Progressive disclosure: show the next meaningful choice; reveal filters, cache details, answers, and storage controls only when relevant.
- Explicit side effects: browsing is read-only; chat submission, downloads, deletion, and canvas changes require a deliberate action.
- Source transparency: local/cloud, release, cache, access tier, and reuse policy are inspectable wherever they affect trust or availability.
- Tradeoff: dense desktop utility controls are acceptable, but the default surface must remain visually sparse.

## Visual language
- Color: near-white surfaces, graphite text, muted blue for primary actions, soft green for healthy/local-ready states, amber for stale/restricted states, red only for actionable failures.
- Typography: system sans; compact hierarchy; one strong title per panel; no viewport-scaled type.
- Spacing/layout rhythm: 8px base rhythm, 12-16px card padding, consistent right-aligned actions, and no control pairs touching without at least 8px separation.
- Shape/radius/elevation: 10-14px controls, 16px panel/modal surfaces, thin borders, shadows below 10% opacity.
- Motion: a 160-220ms opacity/8-28px directional transition for panel views and the problem-bank companion card, plus height/opacity transition for disclosure. Respect reduced motion and avoid reflow-heavy animation.
- Imagery/iconography: MUI/lucide-style outline icons in controls; problem media is content, never decoration.

### Settings visual language
- Layout: fixed title bar, vertical module navigation on desktop, horizontal tabs on narrow layouts, and one scrollable detail pane.
- Cards: configuration groups use one bordered surface; rows inside it use dividers rather than nested cards.
- Action alignment: refresh, check, sync, reindex, and open-folder actions occupy a consistent right-side action column.
- Copy: keep primary labels visible and move explanatory text into tooltips or contextual status lines. Do not hide state, version, license, or destructive consequences in hover-only content.
- Collapsible content: collapsed rows shrink to their summary height; expanded content aligns with the value column and animates height/opacity without shifting unrelated rows.

### Choice analysis cards
- `decision_grid`: default compact grid for ordinary option comparison.
- `proof_stack`: evidence-first vertical list for longer reasoning.
- `canvas_scenario`: one option's canvas evidence at a time; previews start from a captured baseline and never mutate the recorded verdict.
- Verdicts use icon and text, not color alone. Invalid evidence falls back to `decision_grid` with an inline diagnostic rather than blocking the message.

## Components
- Existing components to reuse: MUI `IconButton`, `Tooltip`, `Tabs`, `Chip`, `Skeleton`, existing floating panel/title bar, `ConversationDrawer`, `BlackboardDrawer`, settings section patterns, and problem-bank contract types from `@geochat-ai/app`.
- New components: `ProblemBankSidecar`, `ProblemBankCatalog`, `ProblemBankFilters`, `ProblemResultList`, `ProblemDetail`, `ProblemBankSourceRow`, `ProblemBankSyncProgress`, and a structured `ProblemReference` composer attachment.
- Variants/states: local/cloud, open/restricted, cached/remote-only/stale, idle/checking/syncing/ready/error, list/detail, answer collapsed/expanded.
- Token ownership: MUI theme plus `src/renderer-react/src/styles.css`; do not introduce a parallel design system or new styling dependency.

## Accessibility
- Target: WCAG AA contrast for text and controls.
- Keyboard/focus: all header actions, catalog cards, filters, result rows, disclosures, and detail actions are keyboard reachable with visible focus. Focus returns to the invoking item after closing detail or filters.
- Semantics: icon-only buttons require localized accessible names and tooltips; sync progress uses `aria-live="polite"`; result counts and errors are announced without moving focus.
- Media: use provided alt text; otherwise use a localized problem-image fallback rather than filename text.
- Reduced motion: replace directional/height animation with an immediate state change or short opacity transition.

## Responsive behavior
- Desktop primary; narrow fallback down to 360px panel width.
- At wide widths, result list and detail may form a master-detail split. At narrow widths, catalog, results, and detail are single-stack views with an explicit back button.
- Filter controls collapse into a sheet/popover below 720px. Result metadata wraps; prompts and LaTeX never force horizontal scrolling.
- Hover adds affordance only; all status and actions remain discoverable for touch and keyboard users.

## Interaction states
- Loading: skeleton rows preserve the expected catalog/list layout; do not replace the whole panel with a spinner.
- Empty: distinguish no configured source, no cached source, and no filter matches; each state offers one relevant recovery action.
- Error: retain usable cached data, place an inline error beside the failed source/action, and offer retry. Never clear the active cache on a failed update.
- Success: show current release/cache state in the row; transient success copy must not become a permanent banner.
- Partial publication: if aggregate indexes load but referenced pages/postings/lookup are missing, keep source management available, disable drill-down, and report `题库索引尚未完整发布`.
- Offline/slow network: serve the most recent verified active release, mark last-checked time, pause download progress safely, and preserve `.part` resume state.
- Corrupt cache: quarantine the artifact/release, keep the previous verified release active, and expose a repair action.

## Content voice
- Tone: direct, calm, operational.
- Terminology: `本地题库`, `云端题库`, `当前版本`, `离线可用`, `检查更新`, `同步`, `发送到对话`, `在画板中分析`.
- Microcopy: describe user-visible outcomes, not storage internals. Use cloud terminology only for the problem-bank source; do not imply account sync or upload of user work.
- Warnings: say why access/reuse is limited and what action is unavailable; avoid alarm language for stale but usable data.

## Implementation constraints
- Framework/styling: React 19, MUI 9, `motion/react`, and repository CSS; no new UI dependency.
- Data boundary: renderer uses typed Tauri commands/events for versioned cache state and backend APIs for normalized catalog/problem data. It must not own release activation, integrity validation, or direct R2 caching.
- Performance: paginate/virtualize large lists; cache decoded summaries; lazy-load media and answers; do not render 300k records or download all media by default.
- Security/licensing: reject cross-origin manifest redirects; never promote restricted/unknown content into commercial or sponsor-only flows without an explicit policy decision.
- Compatibility: keep GeoGebra visible and mounted while switching panel views. Browser interactions must not remount the applet or reset canvas state.
- Verification: targeted parser/state tests, React interaction tests for navigation/filter/handoff, Rust cache tests for failure/rollback, typecheck, renderer build, and source-dev screenshots at desktop and narrow widths.

## Open questions
- [ ] Decide which restricted/unknown datasets may appear in the public open-source client / owner: product + legal / impact: catalog visibility and downstream actions.
- [ ] Publish and verify bank pages, facet postings, and problem-id lookup for the active release / owner: data pipeline / impact: browser drill-down remains disabled until complete.
- [ ] Define initial records/media cache quotas from measured production artifacts / owner: desktop engineering / impact: storage defaults and offline controls.
- [ ] Confirm whether sponsor status changes access to additional banks or only presentation/theme / owner: product / impact: entitlement copy and filtering.
