# GeoGebra Applet Vendor Source

- Status: current implementation reference
- Last refreshed: 2026-09-29
- Owner area: renderer / GeoGebra integration

## Vendored Runtime

The desktop project vendors the GeoGebra applet runtime under `vendor/geogebra`
so the Tauri app can serve the applet from the local Bun backend.

- Desktop copy: `vendor/geogebra`
- Copied footprint: about 159 MB, 659 files

The renderer constructs the asset URLs as:

- `deployggb.js`: `${GEOGEBRA_ASSET_BASE}/deployggb.js`
- HTML5 codebase: `${GEOGEBRA_ASSET_BASE}/HTML5/5.0/web3d/`

In the desktop app, `GEOGEBRA_ASSET_BASE` defaults to the local backend route:

```text
http://127.0.0.1:8000/tools/geogebra-assets-v2
```

or can be overridden with:

```text
VITE_GEOGEBRA_ASSET_BASE
```

## Desktop Integration Notes

The Tauri desktop app serves `vendor/geogebra` through the local Bun backend.
That keeps the desktop app self-contained.

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
