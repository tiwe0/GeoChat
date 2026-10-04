## Verification boundaries

Release artifacts are published only after the repository quality gates and the
platform package jobs complete. The uploaded package-smoke evidence covers the
bundle layout, packaged backend health and authentication, and a minimal launch
of a platform-specific target. On macOS, the launch target is the executable
inside the generated `.app` bundle. On Windows, the launch target is the
release-build executable at `src-tauri/target/release/geochat-desktop-tauri.exe`;
it is not an executable discovered through an NSIS or MSI installation.

The macOS package job additionally requires `canvas-macos.json`: the packaged
GeoGebra resources must initialize in a real, ephemeral WKWebView with the
production CSP plus a per-document nonce. This smoke requires applet readiness,
a drawing canvas, and verified coordinates after constructing a point. It blocks
asset upload on timeout, script/CSP errors or failed functional checks. It tests
the embedded runtime and CSP contract, not the complete Tauri window or a live
model conversation.

Trusted macOS builds using the signed pipeline additionally produce
`signing-macos.json`. This separate evidence covers Developer ID signatures and
secure timestamps on the App, shell, Bun and DMG; hardened runtime on executables;
Bun's runtime-specific entitlements; accepted DMG notarization; App and DMG staple
validation; and Gatekeeper assessment. The DMG is mounted read-only to validate
its embedded App and compare the shell, Bun and sealed-resource manifest against
the original signed App. Missing credentials or any failed check block artifact
upload. PR and build-only untrusted-branch jobs do not receive Apple credentials
and do not claim this signing evidence.

Neither the ordinary smoke evidence nor the additional signing evidence claims:

- Windows Authenticode verification;
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
