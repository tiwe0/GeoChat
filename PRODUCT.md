# Product

## Register

product

## Users

GeoChat Desktop serves people working through math and geometry problems on a desktop: educators preparing visual explanations, students exploring constructions, and developers validating AI-assisted GeoGebra workflows. They are usually in a focused work session, moving between a prompt, generated construction steps, the GeoGebra canvas, and local model settings.

## Product Purpose

GeoChat Desktop is a local-first AI mathematics visualization workbench. It lets a user describe a problem, turns the request into GeoGebra actions, writes those actions into the embedded canvas, and explains the resulting relationships. Success means the canvas stays primary, the assistant remains immediately available, and local runtime details never feel like an account or SaaS dashboard.

## Current Product Surface

- Desktop workbench: local Tauri shell, embedded GeoGebra canvas, assistant chat, model settings, conversation/run diagnostics, local update state, and desktop problem-bank browsing.
- Local backend: the packaged Bun sidecar owns conversations, agent runs, provider proxying, SQLite persistence, and local problem-bank import routes.
- Open-source access: the public build uses local access state and does not call a GeoChat account or authorization service by default.
- Optional integrations: developers may configure their own problem-bank, model-registry, update, or debug endpoints through environment variables. No GeoChat-hosted endpoint is configured by default in this repository.

## Brand Personality

Quiet, precise, lightweight. GeoChat should feel like a serious desktop instrument for mathematical thinking: calm enough for long sessions, exact enough to trust, and clear enough that the user always understands what the system is doing.

## Anti-references

Avoid account-centric SaaS shells, marketing landing pages inside the workbench, heavy glassmorphism, deep shadows, decorative gradients, nested card stacks, debug-console language in normal user flows, and motion that does not communicate a state change.

## Design Principles

1. Canvas first. GeoGebra is the main workspace; controls should frame it without competing for attention.
2. Conversation as a tool, not a destination. The chat panel should be easy to summon, hide, move, and scan while leaving the canvas visible.
3. Local desktop confidence. Settings, status, file export, and model controls should feel like a native utility surface rather than a cloud account flow.
4. Explain the math path. Outputs should show the construction, the reasoning, and any tool activity in a compact reviewable form.
5. Treat external content as optional. Problem-bank data, update checks, and remote registries should support the desktop workflow only when a developer explicitly configures them.
6. Make data sharing explicit. Any future telemetry or improvement-plan upload must be opt-in and visibly redacted.
7. Sponsor access without promotion weight. Sponsorship is a top-level action, but the surface should stay modest and respectful of the workbench.

## Accessibility & Inclusion

Target pragmatic WCAG AA contrast for text and controls. All icon-only controls need accessible names and visible focus states. Reduced-motion preferences must disable nonessential transitions and the onboarding text dissolve. The app should remain usable when hover-only hints are unavailable, and image upload affordances must clearly communicate when a selected model does not support images.
