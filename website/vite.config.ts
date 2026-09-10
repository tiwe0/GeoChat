import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The prerender step reads dist/index.html as its shell, so keep the
    // client manifest predictable and assets content-hashed.
    assetsDir: "assets",
    cssMinify: true
  }
});
