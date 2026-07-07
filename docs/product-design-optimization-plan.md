# GeoChat Desktop Product Design Optimization Plan

Last refreshed: 2026-06-19

## Executive Summary

GeoChat Desktop already has a credible product center: a local-first AI math workbench built around an embedded GeoGebra canvas. The current design issue is not lack of polish. The issue is hierarchy. The app is visually careful, but the chat panel, top chrome, settings modal, and problem-bank state still compete with the canvas instead of orbiting it.

The next product-design pass should make one principle concrete:

```text
Canvas first; assistant available; runtime details quiet until needed.
```

This plan turns the 2026-06-19 design critique into implementation-ready work. It should be used as the backlog contract for UI work on the desktop renderer before broad visual refactors or new feature surfaces are added.

## Evidence Reviewed

- `PRODUCT.md`: defines GeoChat Desktop as a local-first AI mathematics visualization workbench where the canvas stays primary.
- `DESIGN.md`: defines the active design contract: quiet, precise, lightweight, canvas-first, desktop utility over SaaS dashboard.
- `.impeccable/critique/2026-06-19T07-36-17Z__src-renderer-src-workbenchapp-tsx.md`: scored the current workbench at 26/40 with three P1 issues.
- Browser inspection of `http://127.0.0.1:1420` at `1440x900` and `390x844`: confirmed GeoGebra loads, default chat panel covers a large portion of the canvas, and narrow fallback still lets the panel overflow by several pixels.
- Browser detector injection: reported 21 page-level hints concentrated around the workbench shell, GeoGebra stage, floating panel, composer, and problem-bank surface.

## Product Diagnosis

### What Works

- The GeoGebra canvas gives the product a concrete identity. It does not feel like a generic chat shell.
- The restrained visual system, compact controls, and system-font typography are directionally right for long desktop sessions.
- Accessibility foundations exist: icon buttons have `aria-label`, focus-visible styling exists, and reduced-motion handling is present.
- Settings and diagnostics expose real product capability rather than fake simplicity.

### What Blocks Maturity

- The default chat panel footprint makes the first screen read as a chat product over a grid, not a geometry workbench with an assistant.
- The top chrome exposes too many icon-only actions at equal visual weight.
- Problem-bank empty and unavailable states need clearer hierarchy so they do not read as broken data.
- Settings are grouped by implementation structure instead of user decisions.
- The UI leans on translucency, blur, and soft elevation more than a precise desktop instrument should.

## Design Targets

### Target Experience

On first open, a user should read the screen in this order:

1. GeoGebra canvas and current mathematical state.
2. One obvious way to ask GeoChat to construct or explain something.
3. Current local runtime/canvas status.
4. Secondary workspace tools: history, problem bank, settings, export.

### Target Heuristic Score

Current critique score: `26/40`.

Target after this plan: `32/40` or higher.

The score should improve through hierarchy, state clarity, and responsive fit, not through decorative styling.

## Non-Goals

- Do not redesign the public marketing site in this pass.
- Do not introduce a new component library or CSS framework.
- Do not change the agent, GeoGebra command, backend, or problem-bank API contracts unless a UI state cannot be represented without a small typed addition.
- Do not make the app feel like an account-centric SaaS dashboard.
- Do not remove advanced model/runtime controls; hide or sequence them when they are not needed.

## Phase 1: Workbench Hierarchy

### Goal

Make the canvas the dominant first-viewport object while keeping the assistant immediately available.

### Current Problem

The floating chat panel defaults to a large overlay. At `1440x900`, it covers the right side of the canvas. At `390x844`, the panel width exceeds the viewport. This violates the `PRODUCT.md` and `DESIGN.md` canvas-first contract.

### Required Changes

1. Change the default chat presentation from a dominant floating card to a subordinate workbench tool.
   - Preferred direction: a compact docked assistant rail or compact prompt panel that expands after focus or first message.
   - Acceptable direction: keep the floating panel, but reduce default width/height and place it so it does not block the canvas origin or primary construction region.

2. Remove duplicate intro weight.
   - Keep either the canvas intro or the panel welcome card as the primary first-run explanation.
   - If both remain, the panel version must be shorter and action-focused.

3. Make narrow fallback structural.
   - At narrow widths, the assistant should fit within the viewport with predictable margins.
   - Canvas status and selection chips must not overlap the composer.

4. Preserve fast access.
   - The user must still be able to open, hide, and resize the assistant without going through settings.

### Likely Files

- `src/renderer/src/WorkbenchApp.tsx`
- `src/renderer/src/ChatPanel.tsx`
- `src/renderer/src/GeoGebraStage.tsx`
- `src/renderer/src/workbench-shell-state.ts`
- `src/renderer/src/workbench-desktop-config-state.ts`
- `src/renderer/src/desktop-config.ts`
- `src/renderer/src/styles.css`

### Acceptance Criteria

- At `1440x900`, the canvas remains visually dominant and the default assistant panel does not cover the central drawing area.
- At `390x844`, no assistant panel, composer, or status chip exceeds viewport width.
- The user can send a first prompt without opening settings.
- The first screen does not repeat the same onboarding message with equal weight in two places.
- Browser screenshots pass for desktop and narrow viewport.

## Phase 2: Chrome And Primary Actions

### Goal

Separate navigation, workspace actions, and overflow actions so users do not need to decode a row of equal-weight icons.

### Current Problem

The top chrome exposes language, chat, new conversation, history, save, problem bank, and more as compact icon clusters. The buttons have accessible names, but sighted first-time users must rely on tooltip discovery for core actions.

### Required Changes

1. Define action tiers.
   - Tier 1: ask GeoChat / show assistant.
   - Tier 2: export canvas, problem bank, history.
   - Tier 3: settings, task records, about, language.

2. Make product-level actions readable.
   - `Problem bank` and `Export .ggb` should not be permanently hidden behind ambiguous icons when space allows.
   - The active view should have a text-backed active state, not only a blue icon background.

3. Reduce duplicate controls.
   - Chat, new conversation, and history should not feel like two competing toolbars unless each location has a clear contextual role.

4. Keep desktop window behavior intact.
   - Windows traffic controls and Tauri drag regions must continue to work.

### Likely Files

- `src/renderer/src/AppChrome.tsx`
- `src/renderer/src/ChatPanel.tsx`
- `src/renderer/src/workbench-ui.tsx`
- `src/renderer/src/i18n.ts`
- `src/renderer/src/styles.css`

### Acceptance Criteria

- A first-time user can identify the problem bank, export, and settings entry points without hovering every icon.
- Icon-only controls that remain are either repeated local controls inside a contextual panel or low-frequency actions.
- Keyboard focus order follows the visual action order.
- Existing `aria-label` coverage is preserved or improved.
- Chrome still fits at desktop width and uses an explicit compact mode under narrow widths.

## Phase 3: Problem Bank State Clarity

### Goal

Make problem-bank unavailable and empty states read as intentional product states, not broken data.

### Current Problem

The problem-bank page can show counters, filters, detail panes, and empty result messages even when there is no usable problem data. This mixes unavailable, loading, and empty states.

### Required Changes

1. Replace fake data UI with a dedicated unavailable state.
   - Do not render counters, filters, empty result messages, or detail panes when problem data is unavailable.
   - Show what local data source or import action would make the view useful.

2. Provide one clear next action.
   - If local import is available, route to import.
   - If a local fixture is expected, explain where to add or select it.

3. Preserve real empty states.
   - `No matching problems` should appear only when data exists and filters return no results.

### Likely Files

- `src/renderer/src/ProblemBankPage.tsx`
- `src/renderer/src/WorkbenchApp.tsx`
- `src/renderer/src/i18n.ts`
- `src/renderer/src/styles.css`
- Tests around problem-bank unavailable and empty rendering if present or newly added.

### Acceptance Criteria

- Unavailable state shows no fake `0 sets` or `0 problems` data.
- The unavailable message has one primary action and one secondary explanation at most.
- Empty state still works for genuine empty/filter results.
- The page remains usable with keyboard and screen reader semantics.

## Phase 4: Settings Decision Flow

### Goal

Turn settings from an implementation inventory into a decision-shaped utility panel.

### Current Problem

The model tab exposes provider, model, custom model, key, endpoint, vision assist provider, vision assist model, vision key, vision endpoint, and reassurance copy in one long flow. This is complete but cognitively expensive.

### Required Changes

1. Regroup settings by user decision.
   - `Text model`: provider, model, key.
   - `Image fallback`: vision assist model, only expanded when primary model lacks image support or user opens it.
   - `Advanced endpoint`: custom model ID and custom base URL.
   - `Local privacy`: short statement that keys stay on this device.

2. Use progressive disclosure.
   - Hide endpoint/custom model controls until an `Advanced` disclosure is opened.
   - Keep image fallback visible as a status row when relevant, not a full second form by default.

3. Improve labels.
   - Replace developer-facing labels where possible: for example, `Vision assist model` can become `Image understanding model` if it better matches user intent.
   - Keep provider/model details available for advanced users.

### Likely Files

- `src/renderer/src/ConfigDialog.tsx`
- `src/renderer/src/workbench-ui.tsx`
- `src/renderer/src/i18n.ts`
- `src/renderer/src/styles.css`

### Acceptance Criteria

- A normal user can configure a text model key without understanding vision fallback.
- A user with image input needs can discover why image upload is disabled and where to configure the image model.
- Advanced endpoint/custom model controls are still reachable.
- Save/cancel behavior remains unchanged.

## Phase 5: Visual Material Cleanup

### Goal

Make the UI feel like a precise desktop instrument by reducing decorative blur and soft elevation.

### Current Problem

The app avoids loud decoration, but it repeatedly uses translucent panels, backdrop blur, radial backgrounds, and soft shadows. This is controlled, but it softens the product more than the math-workbench identity needs.

### Required Changes

1. Flatten core surfaces.
   - Canvas-adjacent UI should use solid or near-solid fills.
   - Reserve blur for modal scrims or genuinely floating transient layers.

2. Reduce shadow hierarchy.
   - Use shadow only to distinguish movable overlays from base surfaces.
   - Prefer borders and surface contrast for persistent panels.

3. Keep accent color semantic.
   - Primary blue should mean primary action, active selection, or focused state.
   - Avoid blue as general decoration.

4. Keep motion state-based.
   - No decorative ambient motion in the task surface.
   - Preserve reduced-motion behavior.

### Likely Files

- `src/renderer/src/styles.css`
- `DESIGN.md` if the material rules need to be made stricter after implementation.

### Acceptance Criteria

- Workbench screenshots read as a native utility surface rather than a glass-card UI.
- Core text contrast remains WCAG AA.
- No new decorative gradients, broad glass panels, or large soft shadows are introduced.
- `prefers-reduced-motion` still disables nonessential transitions.

## Phase 6: User-Facing Failure And Runtime States

### Goal

Make backend, model, local data, and canvas failures explainable at the surface where the user can recover.

### Current Problem

During browser inspection, backend-backed calls returned errors and blackboard fetch failed in the console. The visible workbench still mostly showed healthy canvas/local-service state. The UI should distinguish canvas readiness from feature-specific readiness.

### Required Changes

1. Separate canvas status from feature status.
   - Canvas ready means GeoGebra can draw.
   - Backend, local data, and problem-bank status should have their own scoped messages when a feature depends on them.

2. Add recovery copy where the action happens.
   - Problem bank unavailable: explain local data or import cause and next action.
   - Image upload disabled: explain model capability and link to image model settings.
   - Blackboard/history unavailable: show a small local diagnostic, not a console-only failure.

3. Keep normal mode quiet.
   - Do not turn the whole app into a debug dashboard.
   - Only surface failures when they affect the action the user is trying to take.

### Likely Files

- `src/renderer/src/WorkbenchApp.tsx`
- `src/renderer/src/ChatPanel.tsx`
- `src/renderer/src/ProblemBankPage.tsx`
- `src/renderer/src/ConfigDialog.tsx`
- `src/renderer/src/workbench-api.ts`
- `src/renderer/src/i18n.ts`
- `src/renderer/src/styles.css`

### Acceptance Criteria

- Canvas ready state cannot mask a failed problem-bank or local-data action.
- Feature-specific failures include an action or explanation.
- Console-only failures for user-visible features are eliminated or intentionally logged as non-user-impacting.

## Implementation Order

1. Workbench hierarchy and responsive fit.
2. Problem-bank state clarity.
3. Chrome action hierarchy.
4. Settings decision flow.
5. Material cleanup.
6. Runtime/failure states.

This order fixes the most visible product promise first, then removes the most confusing state, then cleans the supporting surfaces.

## Verification Plan

Run the smallest checks that prove the UI change, then broaden.

### Static And Build Gates

```sh
bun run typecheck
bun run tauri:renderer:build
```

Run broader gates if implementation touches shared runtime or package surfaces:

```sh
bun run build
bun test tests
```

### Browser Evidence

Capture screenshots for:

- Workbench at `1440x900`.
- Workbench at `390x844`.
- Settings model tab.
- Problem bank unavailable state.
- Problem bank data state, if a local fixture is available.

### Design Review Gates

- Re-run the main workbench critique and target `32/40` or higher.
- Run the detector against the changed renderer files.
- Confirm no text overflow, clipped buttons, or inaccessible icon-only primary actions.

## Tracking Checklist

- [x] Phase 1: canvas-first workbench hierarchy implemented and screenshot-verified.
- [x] Phase 2: top chrome action hierarchy clarified.
- [x] Phase 3: problem-bank unavailable state no longer renders fake empty data.
- [x] Phase 4: settings model flow grouped by user decisions.
- [x] Phase 5: blur/shadow/material rules tightened in implementation.
- [x] Phase 6: feature-level failure states surfaced where users can recover.
- [x] `DESIGN.md` refreshed if implementation changes the durable design contract.
- [ ] New critique score recorded after implementation.

### Implementation Evidence: 2026-06-19

- Workbench screenshot checks passed at `1440x900` and `390x844`; the floating chat panel stays inside the viewport and no horizontal overflow was detected.
- Top chrome now exposes explicit `Export canvas` and `Problem bank` actions on desktop, then compresses to icon controls on narrow widths without clipping.
- Problem-bank unavailable state renders a dedicated message and hides the empty data grid, avoiding fake `0` counts.
- Settings model tab is grouped into text model, image understanding, vision assist, and advanced endpoint decisions; advanced endpoint details default closed.
- Material cleanup removed persistent glass/blur treatment from the workbench, chat panel, problem bank, settings, and chrome; only modal scrim blur remains.
- A real local `401` blackboard fetch failure now surfaces in the working-memory drawer as a recoverable unavailable state.
- Verification run: `bun run typecheck`, `bun run tauri:renderer:build`, and Playwright screenshots for desktop, narrow, problem-bank unavailable, settings model, and blackboard-error states.

## Open Product Decisions

- Should the assistant default to compact docked mode for all users, or only for first-run/empty conversations?
- Should `Problem bank` be framed as a core workflow in the desktop app or as an optional local library adjacent to the workbench?
- Should advanced provider/model settings be hidden by default for non-developer users, or is model configuration central enough to remain fully visible?
