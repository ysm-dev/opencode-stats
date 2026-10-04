import { defineConfig, searchForWorkspaceRoot } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";
import { createRequire } from "node:module";
import { dirname } from "node:path";

export default defineConfig({
  plugins: [tailwind(), solid()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [
        searchForWorkspaceRoot(decodeURIComponent(new URL(".", import.meta.url).pathname)),
        dirname(createRequire(import.meta.url).resolve("@opencode/ui/fonts/Inter.ttf")),
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "frame-ancestors 'none'",
    },
    proxy: { "/api": { target: "http://127.0.0.1:22440", changeOrigin: true } },
  },
  build: {
    target: "esnext",
    cssCodeSplit: false,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
