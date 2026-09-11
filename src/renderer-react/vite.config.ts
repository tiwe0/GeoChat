import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const version = process.env.VITE_GEOGEBRA_VERSION ?? "5.4.929.3";
const patchedRoot = `/api/geogebra/resources/patched/${encodeURIComponent(version)}/web3d/`;
const proxy = (rewrite: (path: string) => string) => ({
  target: "http://localhost:8787",
  changeOrigin: true,
  rewrite,
});

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: "127.0.0.1",
    proxy: {
      "/6DEDEE90272B26755E684AA48BE35A4F.cache.js": proxy((path) => `${patchedRoot}${path.slice(1)}`),
      "/clear.cache.gif": proxy((path) => `${patchedRoot}${path.slice(1)}`),
      "/compilation-mappings.txt": proxy((path) => `${patchedRoot}${path.slice(1)}`),
      "/deferredjs": proxy((path) => `${patchedRoot}${path.slice(1)}`),
      "/fonts": proxy((path) => `${patchedRoot}${path.slice(1)}`),
      "/js": proxy((path) => `${patchedRoot}${path.slice(1)}`),
    },
  },
  build: { sourcemap: true },
});
