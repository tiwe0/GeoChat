# Open Source Scan

Date: 2026-07-07

Scope: `geochat-open-core` public desktop repository.

## Result

Status: ready for public-remote preparation after an external history secret
scan.

The repository has been prepared so the public snapshot contains the desktop
app, local backend, shared packages, development tools, tests, and
`vendor/geogebra`.

## Boundary Checks

- No tracked `cloudflare/` or `services/` directories.
- No tracked release-signing material, production credential files, generated
  local databases, or packaged release artifacts.
- `vendor/geogebra/` is intentionally included and must remain covered by
  `THIRD_PARTY_NOTICES.md`.

## Remote-Service Checks

The public app build does not configure GeoChat-hosted endpoints by default:

- Access state is local in `src-tauri/src/access.rs`.
- Problem-bank and model-registry URLs are disabled unless a developer explicitly
  sets `VITE_GEOCHAT_PROBLEM_BANK_API_BASE_URL` or
  `VITE_GEOCHAT_MODEL_REGISTRY_API_BASE_URL`.
- Shell update and app-bundle update endpoints are disabled unless a developer
  explicitly configures the corresponding environment variables.

## Secret Checks

Built-in `rg` scans found no production credential files or obvious live
secrets. Remaining API-key-like matches are test fixtures that intentionally use
synthetic provider-looking strings to verify redaction behavior.

External history scanners were not available on this machine:

- `gitleaks`: not installed
- `trufflehog`: not installed

Before publishing to GitHub, run at least one history scanner against the final
repository and rotate any credential that ever appeared in a committed snapshot.

## License Checks

- Root `LICENSE`: Apache License 2.0.
- Root `NOTICE`: GeoChat-owned code/documentation attribution plus third-party
  notice pointer.
- Root `package.json`: `SEE LICENSE IN LICENSE`, because this repository
  includes third-party vendored assets under `vendor/`.
- `packages/app/package.json`: Apache-2.0 for the GeoChat-owned shared package.

Keep `THIRD_PARTY_NOTICES.md` with the GeoGebra notice, because
`vendor/geogebra/` is included under GeoGebra's own terms and is not relicensed
as first-party Apache-2.0 code.
