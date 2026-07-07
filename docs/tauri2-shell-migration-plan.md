# Tauri 2 Shell Migration Plan

Status: Tauri-only desktop branch. The Tauri shell is the default desktop shell and owns packaging, window lifecycle, native commands, backend process supervision, app-bundle bootstrapping, and packaged-layout smoke coverage.

Electron build scripts, dependencies, main/preload sources, and legacy full-package update metadata checks have been removed from this branch.

## Current Architecture

```text
Tauri 2 shell
  Rust command bridge
  WebView window
  fixed Bun runtime sidecar
  packaged app bundle resources

packaged app bundle
  backend/backend.bundle.js
  renderer/**
  vendor/**

user data
  geochat-desktop.sqlite
  settings and update state
  updates/current
  updates/previous
```

The backend, harness, and SolidJS renderer remain the product layer. Tauri is the native host and process supervisor.

## Update Strategy

- App-bundle updates replace backend, renderer, harness, prompt/policy code, and vendor resources.
- App-bundle updates never replace the bundled Bun runtime.
- Full shell updates are handled by new Tauri installers until a separate Tauri shell-updater design is scoped.
- Public builds can prepare and smoke-test the local app-bundle layout.

## Core Commands

```sh
bun run dev
bun run tauri:prepare
bun run tauri:check
bun run tauri:build
bun run tauri:build:windows # on Windows CI
bun run tauri:package:smoke
bun run package:backend-smoke
```

`tauri:build` remains the fast local macOS `.app` bundle target. Installer packaging can be run with `tauri:build:macos` for the `.app` and DMG targets or `tauri:build:windows` for the Tauri NSIS installer.

## Shell Refactor Plan

Status: implemented. This follow-up cleanup for the Tauri-only shell preserves product behavior, public command names, environment variable names, package layout, app-bundle format, and existing smoke evidence paths.

The immediate problem is that `src-tauri/src/main.rs` owns too many native-shell responsibilities at once: command registration, backend and MCP process supervision, settings persistence, app-bundle installation, packaged-layout smoke evidence, path validation, manifest verification, version comparison, and update error classification. The refactor should split stable native-shell domains without redesigning the renderer, backend API, or app-bundle process.

Implemented modules:

- `src-tauri/src/app_bundle.rs`: app-bundle manifest, path, hash, signature, download, compatibility, version, and update-error policy.
- `src-tauri/src/sidecar.rs`: backend/MCP process launch, Bun runtime resolution, health polling, loopback ports, and Windows child-console hiding.
- `src-tauri/src/access.rs`: local access state and device identity helpers.
- `src-tauri/src/settings.rs`: persisted desktop settings types, defaults, settings file IO, and desktop database path resolution.

### R1: App-Bundle Protocol Module

Create `src-tauri/src/app_bundle.rs` and move only app-bundle protocol and verification logic out of `main.rs`.

Move:

- `AppBundleAsset`, `AppBundleEntry`, and `AppBundleManifest`.
- Manifest parsing and validation.
- Bundle asset path validation and safe path resolution.
- Bundle asset hash verification and download helpers.
- Manifest signature verification.
- App-bundle shell compatibility and version comparison.
- App-bundle update error classification.
- Existing app-bundle manifest/path tests.

Do not move:

- Tauri command functions.
- `DesktopState`.
- App-bundle install, rollback, renderer navigation, restart scheduling, or packaged-layout evidence orchestration.
- Any unrelated publication script or release schema field.

Acceptance:

- `main.rs` remains the owner of Tauri command orchestration, but no longer owns low-level manifest, signature, path, hash, and version policy.
- Existing app-bundle tests keep the same assertions and move with the protocol module.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `cargo test --manifest-path src-tauri/Cargo.toml` pass.

### R2: Sidecar Process Module

Create `src-tauri/src/sidecar.rs` and move process-launch details that are not Tauri commands.

Move:

- Backend launch path resolution.
- Bun runtime command resolution.
- Backend health polling.
- MCP entry resolution and child-process launch.
- Windows child-console hiding helpers.

Do not move:

- The managed `DesktopState` fields.
- Command handlers such as `get_mcp_status` and `set_mcp_enabled`.
- User-facing status payload structs unless they become private to the process module without changing serialized fields.

Acceptance:

- Windows sidecar launches still apply `CREATE_NO_WINDOW`.
- Backend and MCP environment variables keep the same names and precedence.
- `bun test tests/package-config.test.ts` continues to guard the Windows console behavior.
- Rust fmt/check/test pass.

### R3: Local Access Module

Create `src-tauri/src/access.rs` and keep the public build's access behavior local.

Move:

- Local access state.
- Stored settings compatibility.
- Runtime authorization refresh.
- Device ID helper.

Do not move:

- Tauri command wrappers.
- Settings file persistence ownership until `settings.rs` exists.
- Public serialized field names used by the renderer.

Acceptance:

- The public build stays locally authorized.
- Silent access-check scheduling remains a no-op in the public build.
- Rust fmt/check/test pass.

### R4: Settings Module

Create `src-tauri/src/settings.rs` and move persisted settings types and file IO.

Move:

- `DesktopSettings`, compatibility settings fields, update preferences, and improvement-plan preferences.
- Default settings constructors.
- Settings load/save helpers.
- Database path helper if it remains settings/data-directory specific.

Do not move:

- Runtime state locks from `DesktopState`.
- Tauri command wrappers for update/improvement-plan preferences until the module exposes a narrow persistence API.

Acceptance:

- Existing settings JSON remains backward-compatible.
- Missing fields still hydrate through the current defaults.
- No migration is introduced unless a future schema change requires it.
- Rust fmt/check/test pass.

### R5: Main Shell Contraction

After R1-R4, keep `src-tauri/src/main.rs` focused on native-shell composition:

- App setup.
- Managed state construction.
- Tauri command registration.
- Window/page-load hooks.
- Cross-module orchestration that genuinely needs `AppHandle` or `State<DesktopState>`.

Acceptance:

- `main.rs` is substantially smaller and no longer mixes protocol parsing, process policy, license IO, and settings file IO in one file.
- Public renderer APIs and serialized payload shapes are unchanged.
- `bun run typecheck`, `cargo check --manifest-path src-tauri/Cargo.toml`, `cargo test --manifest-path src-tauri/Cargo.toml`, and the relevant package/config smoke tests pass.

### Refactor Guardrails

- Make one module extraction per change set.
- Do not rename environment variables, Tauri commands, script names, or serialized JSON fields during this refactor.
- Do not combine this cleanup with UI redesign, app-bundle schema changes, or release-process changes.
- Keep behavior locked by moving existing tests first, then adding focused tests only when a moved helper currently has no coverage.
- Treat Windows sidecar console behavior, local authorization, app-bundle signature verification, and packaged-layout smoke evidence as regression-sensitive paths.

## Acceptance

- `bun run tauri:prepare` proves the local app-bundle layout can be prepared.
- `bun run bundle:smoke` proves the app-bundle manifest rules.
- GitHub Actions must build both macOS and Windows through the `tauri-package` matrix job.
- No Electron dependency, script, source entrypoint, or release metadata checker should be required for desktop builds.
