import { createRequire } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);
const packageJson = require("./package.json") as { version: string };

/**
 * Build config for the React renderer, which runs alongside the SolidJS one
 * until it reaches parity. Mirrors vite.tauri.config.ts so that switching over
 * is a matter of changing which config tauri.conf.json's beforeBuildCommand
 * runs, not of reworking the build.
 *
 * No GeoGebra asset proxy: the web build fetched the applet from a hosted
 * origin, while the desktop app serves it from the local backend out of
 * vendor/geogebra.
 */
export default defineConfig({
  root: resolve(__dirname, "src/renderer-react"),
  publicDir: resolve(__dirname, "public"),
  base: "./",
  define: {
    "import.meta.env.VITE_GEOCHAT_APP_VERSION": JSON.stringify(packageJson.version)
  },
  server: {
    host: "127.0.0.1",
    port: 1421,
    strictPort: true
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist/renderer-react"),
    emptyOutDir: true
  }
});
