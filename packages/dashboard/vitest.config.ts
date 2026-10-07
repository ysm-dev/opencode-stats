import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { testTimeouts } from "../../scripts/test-timeouts.ts";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { searchForWorkspaceRoot } from "vite";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [solid({ hot: false })],
  server: {
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        dirname(require.resolve("@opencode/ui/package.json")),
      ],
    },
  },
  test: {
    ...testTimeouts,
    css: { include: [/colors\.css/u] },
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://127.0.0.1:22440" } },
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.contract.test.{ts,tsx}", "**/dist/**", "**/.release/**", "**/.dev/**"],
  },
});
