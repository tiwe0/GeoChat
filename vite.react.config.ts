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
  root: resolve(import.meta.dirname, "src/renderer-react"),
  publicDir: resolve(import.meta.dirname, "public"),
  base: "./",
  define: {
    "import.meta.env.VITE_GEOCHAT_APP_VERSION": JSON.stringify(packageJson.version)
  },
  server: {
    host: "127.0.0.1",
    port: 1421,
    strictPort: true,
    // The repository is commonly run from WSL on a Windows-mounted drive
    // (`/mnt/*`). Native inotify events do not reliably cross that boundary,
    // which makes React Fast Refresh appear to be stuck. Polling keeps HMR
    // reliable in both WSL and regular Linux environments; the interval is
    // intentionally modest to avoid excessive filesystem churn.
    watch: {
      usePolling: true,
      interval: 200,
    },
  },
  // The bridge reaches @tauri-apps/api only through dynamic imports, so Vite
  // does not see it during initial dependency scanning and answers the first
  // request with 504 Outdated Optimize Dep. Declaring it up front avoids the
  // re-optimize round trip.
  optimizeDeps: {
    include: ["@tauri-apps/api/core", "@tauri-apps/api/event", "@tauri-apps/api/window"]
  },
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "dist/renderer"),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-runtime",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 50,
            },
            {
              name: "mui-runtime",
              test: /node_modules[\\/](?:@mui|@emotion)[\\/]/,
              priority: 40,
            },
            {
              name: "markdown-ui",
              test: /node_modules[\\/](?:streamdown|@streamdown|react-markdown|remark|rehype|unified|remend|marked|katex)[\\/]/,
              priority: 35,
            },
            {
              name: "math-rendering",
              test: /node_modules[\\/](?:katex)[\\/]/,
              priority: 37,
            },
            {
              name: "markdown-core",
              test: /node_modules[\\/](?:hast-util|mdast-util|micromark|parse5|vfile|unist-util|property-information|entities|hastscript|style-to-js|style-to-object|inline-style-parser|decode-named-character-reference|character-entities|web-namespaces|comma-separated-tokens|space-separated-tokens|html-void-elements|trim-lines|trough|bail|extend|is-plain-obj|zwitch|ccount|longest-streak|markdown-table|get-east-asian-width|@ungap)[\\/]/,
              priority: 36,
            },
            {
              name: "ai-sdk",
              test: /node_modules[\\/](?:ai|@ai-sdk|zod)[\\/]/,
              priority: 25,
            },
            {
              name: "ui-utilities",
              test: /node_modules[\\/](?:react-i18next|i18next|react-joyride|@floating-ui|@gilbarbara|scroll|scrollparent|use-sync-external-store|@fastify)[\\/]/,
              priority: 15,
            },
            {
              name: "motion",
              test: /node_modules[\\/](?:motion|motion-dom|framer-motion)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  }
});
