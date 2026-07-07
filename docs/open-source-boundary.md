# Open Source Boundary

This document describes the boundary of the public GeoChat Desktop repository.
It is written for maintainers and contributors working from the public tree.

## Public Core

| Path | Public role | Notes |
| --- | --- | --- |
| `packages/app/` | Shared schemas, runtime contracts, agent policies, GeoGebra command helpers, and problem-bank types. | Package metadata uses Apache-2.0 for GeoChat-owned code. |
| `backend/src/` | Local backend, agent runner, provider proxy, SQLite repositories, and built-in skills. | Provider keys are runtime-only and must not be committed. |
| `src/renderer/` | Solid workbench UI and local user workflows. | Keep first-run workflows useful with local state and bring-your-own-key providers. |
| `src/shared/` | Renderer/backend shared helpers. | Keep data contracts local and serializable. |
| `src-tauri/` | Tauri shell, native command bridge, and sidecar process management. | Keep native behavior documented through local build and smoke checks. |
| `tests/` | Contract and regression tests for the public desktop product. | Test keys must stay fake and local. |
| `tools/desktop-debug-mcp/` | Local debugging tool surface. | Auth examples must use fake local values. |
| `vendor/geogebra/` | Bundled GeoGebra runtime assets required by the desktop product. | Keep `THIRD_PARTY_NOTICES.md`; do not relicense GeoGebra as first-party code. |
| `docs/` | Desktop architecture, command semantics, product design, and development notes. | Keep docs focused on public desktop development. |
| `scripts/` | Local build, bundle, smoke, typecheck, and app-bundle manifest helpers. | Keep scripts reproducible from this repository alone. |

## Local Capability Boundary

The public build should keep these local capabilities available:

- Local workbench and local conversation history.
- Local GeoGebra rendering.
- Bring-your-own-key model providers.
- Local import/export and local problem authoring.
- Local desktop debugging and tests.

## Verification

Use the public checks before publishing or accepting boundary-sensitive changes:

```sh
bun run oss:check
bun run typecheck
bun run tauri:prepare
bun run tauri:check
bun test tests
```

Run an external history secret scan before pushing to a public remote. Local
pattern checks in this repository are useful, but they are not a substitute for
a full history scanner.
