# Open Source Boundary

This is the public GeoChat Desktop repository. It contains the local desktop
workbench, local backend, shared app contracts, Tauri shell, tests,
documentation, and the vendored GeoGebra runtime required by the desktop app.

GeoChat-owned source code and documentation are licensed under Apache-2.0. The
vendored GeoGebra runtime under `vendor/geogebra/` is a third-party component
and remains under GeoGebra's own license terms; see `THIRD_PARTY_NOTICES.md`.

## Included

- Local-first desktop workbench and Solid renderer.
- Tauri shell and native command bridge.
- Local Bun backend sidecar and SQLite persistence.
- Shared agent/runtime contracts in `packages/app`.
- GeoGebra orchestration and the vendored desktop runtime assets.
- Public tests, local build scripts, and desktop architecture docs.

## Not Included

- Production credentials, account identifiers, local databases, generated
  release artifacts, deployment state, or signing material.
- Hosted service implementations and operator consoles.
- Managed problem-bank datasets that are not part of this repository.

The public desktop build uses local access state and does not call a GeoChat
account or authorization service by default.

## Publication Checklist

Before publishing a regenerated public tree, run:

```sh
bun run oss:check
bun run typecheck
bun run tauri:prepare
bun run tauri:check
bun test tests
```

Also run a history secret scan before pushing to a public remote. The repository
intentionally keeps `.env`, `.dev.vars`, SQLite databases, build output, release
artifacts, and local state ignored.
