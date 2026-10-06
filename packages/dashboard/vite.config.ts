import { defineConfig, runnerImport, searchForWorkspaceRoot } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);

export default defineConfig({
  // The published UI's CSS imports Tailwind from its own path, outside the workspace under Bun's global store.
  resolve: {
    alias: {
      tailwindcss: dirname(require.resolve("tailwindcss/package.json")),
    },
  },
  plugins: [
    tailwind(),
    solid(),
    {
      name: "prepaint-preferences",
      transformIndexHtml: {
        order: "post",
        handler: async () => {
          const loaded = await runnerImport<typeof import("./src/preload.ts")>(
            decodeURIComponent(new URL("./src/preload.ts", import.meta.url).pathname),
            {
              configFile: false,
              ssr: { noExternal: ["@opencode/ui"] },
              server: {
                fs: {
                  allow: [
                    searchForWorkspaceRoot(process.cwd()),
                    dirname(require.resolve("@opencode/ui/package.json")),
                  ],
                },
              },
            },
          );
          return [
            {
              tag: "script",
              attrs: { id: "preferences-startup" },
              children: await loaded.module.classicPreload(),
              injectTo: "head-prepend",
            },
          ];
        },
      },
    },
  ],
  // The worker's HttpApi imports must join the initial scan, not trigger a
  // second optimization/504/full reload while the first page is loading.
  optimizeDeps: { entries: ["index.html", require.resolve("@opencode-stats/engine/worker")] },
  server: {
    // Start the same cold transforms during server startup, before browser navigation.
    warmup: { clientFiles: ["./index.html", "./src/client.tsx"] },
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [
        searchForWorkspaceRoot(decodeURIComponent(new URL(".", import.meta.url).pathname)),
        dirname(require.resolve("@opencode/ui/fonts/Inter.ttf")),
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
