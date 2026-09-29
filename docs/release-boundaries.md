## Verification boundaries

Release artifacts are published only after the repository quality gates and the
platform package jobs complete. The uploaded package-smoke evidence covers the
bundle layout, packaged backend health and authentication, and a minimal launch
of a platform-specific target. On macOS, the launch target is the executable
inside the generated `.app` bundle. On Windows, the launch target is the
release-build executable at `src-tauri/target/release/geochat-desktop-tauri.exe`;
it is not an executable discovered through an NSIS or MSI installation.

That evidence does **not** claim any of the following unless a later release
explicitly says otherwise:

- Developer ID, Authenticode, Apple notarization, or staple verification;
- successful requests to a live third-party model provider;
- successful installation of the Windows NSIS or MSI artifact, or a
  post-install launch from either installer;
- production service deployment or remote environment acceptance;
- exhaustive visual, keyboard, screen-reader, or reduced-motion acceptance;
- feature-level end-to-end behavior from the packaged UI beyond the documented
  launch smoke.

The deterministic desktop conversation/canvas scenario is a debug-only local
acceptance test. It is intentionally reported separately from packaged-release
evidence.
