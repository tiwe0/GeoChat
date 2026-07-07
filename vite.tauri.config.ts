import { createRequire } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const require = createRequire(import.meta.url);
const packageJson = require("./package.json") as { version: string };

export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  publicDir: resolve(__dirname, "public"),
  base: "./",
  define: {
    "import.meta.env.VITE_GEOCHAT_APP_VERSION": JSON.stringify(packageJson.version)
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true
  },
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src")
    }
  },
  plugins: [solid()],
  build: {
    outDir: resolve(__dirname, "dist/renderer"),
    emptyOutDir: true
  }
});
