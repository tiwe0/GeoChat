# GeoGebra Applet Vendor Source

- Status: current implementation reference
- Last refreshed: 2026-10-04
- Owner area: renderer / GeoGebra integration

## Vendored Runtime

The desktop project vendors the GeoGebra applet runtime under `vendor/geogebra`
so the Tauri app can serve the applet from its verified local resource bundle.

- Desktop copy: `vendor/geogebra`

The renderer constructs the asset URLs as:

- `deployggb.js`: `${GEOGEBRA_ASSET_BASE}/deployggb.js`
- HTML5 codebase: `${GEOGEBRA_ASSET_BASE}/HTML5/5.0/web3d/`

In production, `GEOGEBRA_ASSET_BASE` uses the native resource protocol:

```text
geochat-bundle://localhost/vendor/geogebra
```

or can be overridden with:

```text
VITE_GEOGEBRA_ASSET_BASE
```

## Desktop Integration Notes

The production Tauri protocol verifies assets against `app-bundle-manifest.json`
before serving them. Development uses the local Bun asset route. Both stage the
same vendored source, keeping the desktop app self-contained.

Current local route:

```text
/tools/geogebra-assets-v2 -> vendor/geogebra
```

The React renderer integration is split across narrow modules under
`src/renderer-react/src/geogebra/`:

- `ggbdeploy-wrapper.ts` defines and loads the vendored `GGBApplet` runtime.
- `controller.ts` owns command execution and applet lifecycle operations.
- `canvas-context.ts` derives the context supplied to an agent run.
- `selection-context.ts` owns selection observation and refresh semantics.

Together these modules:

- inject the applet using `new window.GGBApplet(...)`;
- set the HTML5 codebase to `HTML5/5.0/web3d/`;
- maintain per-board controller state instead of relying on a single global `window.ggbApplet`;
- expose command execution, canvas context, PNG export, and GGB export as desktop app services.

The vendored runtime is an implementation dependency, not a state authority. The
renderer session controller and canvas transaction adapter remain responsible for
coordinating conversation switches and lossless canvas recovery.

## Strict CSP and GeoGebra script initialization

Only the production renderer entry receives a fresh 64-character nonce shared by
its CSP and known local Vite bootstrap. Remote script tags and vendor HTML never
receive nonce authorization. The static CSP still disallows unrestricted inline
JavaScript, remote scripts and blob scripts.

Two deliberately narrow vendor changes preserve GeoGebra's classic-script
semantics: `gMj` in the current `88D10604D04F201298F9DADF8F8ABD98.cache.js`
uses its existing `vc` nonce helper before inserting an inline library; and
`web3d.__installRunAsyncCode` in `web3d.nocache.js` copies the parent document
script nonce to its deferred-fragment script in the child iframe. The `.nonce`
property is read first because WebKit hides nonce attribute values.

`scripts/lib/geogebra-nonce-contract.mjs` checks both insertion sites during
staging and fails closed if either changes or is duplicated. Replacing the vendor
runtime requires reviewing these patches and rerunning the native canvas smoke.

On macOS, `bun run package:canvas-smoke --bundle-root dist --json-out <path>`
loads packaged resources in an ephemeral WKWebView using the production CSP. It
requires applet readiness, a drawing canvas and successful point construction.
`--without-nonce` is the negative control and must fail with a CSP violation.
This is a real WebKit/runtime check, not a full Tauri UI acceptance test.
