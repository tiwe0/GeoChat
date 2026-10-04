# macOS Developer ID release signing

The `tauri-package` workflow requires these repository Secrets for trusted macOS
builds. Store values only in GitHub Actions Secrets, never in this repository:

Local certificate exports, PEM/private-key files and signing keychains are
Git-ignored as a second guard against accidental commits. Do not force-add them.

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64 of an exported Developer ID Application `.p12`, including its private key |
| `APPLE_CERTIFICATE_PASSWORD` | Password used to encrypt that export |
| `APPLE_SIGNING_IDENTITY` | Exact `Developer ID Application: ... (TEAMID)` certificate identity |
| `APPLE_ID` | Apple account email used for notarization |
| `APPLE_PASSWORD` | Apple application-specific password, not the login password |
| `APPLE_TEAM_ID` | Ten-character Developer Team ID matching the certificate |

## Signing boundary

Only this repository's master/tag push or master/tag dispatch can enter the
signed pipeline. Before exposing credentials, CI validates that the checked-out
commit belongs to `origin/master` history and that a dispatch release ref is a
version tag. PR builds never receive Apple Secrets. A dispatch requesting release
publication from an untrusted workflow ref fails instead of publishing unsigned
macOS installers. This assumes master changes and release-tag creation are
restricted to trusted maintainers; master history alone is not code review.

`scripts/build-signed-macos.mjs` validates credential presence and formatting,
stages resources and compiles with `tauri build --no-bundle` without Apple
credentials, then imports the `.p12` once into a temporary CI keychain and limits its key ACL to
codesign. It removes the decoded export after import, restores the runner's
keychain search list and deletes its own keychain in `finally`. It never changes
the user's application credential storage or the developer's local login keychain.

The resource staging hook runs once without Apple credentials. The staged Bun
runtime is then signed with a secure timestamp, hardened runtime and
`src-tauri/Bun.entitlements.plist`. These five exceptions match Bun v1.3.11's
official entitlement set and apply **only to Bun**, not the Rust shell. A smaller
set is not assumed without a separate packaged-runtime test.

The compile invocation disables `beforeBuildCommand` to avoid duplicate staging.
Only the subsequent `tauri bundle` packaging invocation receives the signing
identity and notarization credentials, not the `.p12` secrets. Cargo and dependency
build scripts do not receive any Apple variables and run before the signing key
is imported. Packaging disables `beforeBundleCommand` to prevent arbitrary hooks
or re-staging and captures subprocess output instead of streaming credentials
into CI logs. It reuses the temporary keychain to sign the shell/App/DMG and
notarize the App. Verification tools receive no Apple environment variables;
the captured `notarytool` invocation receives its required credentials as arguments.

The CI runner and pinned Tauri packaging tools are trusted components. All actions
in this workflow use full commit SHAs, with a regression test preventing mutable
action refs. This audit does not claim immunity to a compromised runner, action
or packaging tool. Account secrets, decoded exports
and keychain files are not included in the uploaded evidence or installer paths.

Tauri CLI 2.12.1 imports certificate Secrets automatically when passed, but its
bundler does not sign arbitrary copied resources. Its App staple helper also
does not check the stapler exit status. Therefore the explicit Bun signing and
independent verification steps are required, rather than merely setting six
environment variables.

`scripts/verify-macos-release.mjs` checks the actual packaged signatures and Bun
entitlements, validates the App ticket, submits the final DMG to Apple with
`--wait`, requires `Accepted`, staples and validates the DMG, and checks Gatekeeper
and the App contained inside the DMG. It writes non-secret evidence only after
all checks pass. Existing backend and launch smokes run afterwards, before upload.

## Validation and rollout

Unit tests use command fixtures and do not access real certificates or Apple.
Actual Secret values cannot be read back from GitHub, so presence checks do not
prove that the export password or notarization password is correct. A successful
trusted CI run and its signing evidence are the acceptance gate.

This change does not repair already-published unsigned installers. Rebuilding
an old tag also requires the signing scripts to exist in that tag's checkout;
merely adding Secrets or using a newer workflow does not backport those scripts.
Publish a new signed version or explicitly backport the pipeline before an old
release rebuild. Browser-download/install acceptance remains a separate check.

## Upstream evidence

- [Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/)
- [Pinned CLI 2.12.1 resource/signing order](https://github.com/tauri-apps/tauri/blob/30da1fd6e17de6107ecc850c95dfb16b5729f2dd/crates/tauri-bundler/src/bundle/macos/app.rs#L93-L140)
- [Tauri certificate import](https://github.com/tauri-apps/tauri/blob/30da1fd6e17de6107ecc850c95dfb16b5729f2dd/crates/tauri-bundler/src/bundle/macos/sign.rs#L19-L43)
- [Tauri bundle-only command and hook boundary](https://github.com/tauri-apps/tauri/blob/30da1fd6e17de6107ecc850c95dfb16b5729f2dd/crates/tauri-cli/src/bundle.rs#L116-L242)
- [Tauri App staple helper](https://github.com/tauri-apps/tauri/blob/30da1fd6e17de6107ecc850c95dfb16b5729f2dd/crates/tauri-macos-sign/src/lib.rs#L252-L271)
- [Bun v1.3.11 entitlements](https://github.com/oven-sh/bun/blob/a04817ce2b7f1a1e8b7cbf8af8f2c027ab072f1d/entitlements.plist)
- [Apple application-specific passwords](https://support.apple.com/en-us/102654)
