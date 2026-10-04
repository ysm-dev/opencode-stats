import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve workspace source inside Stryker's copied workspace too. Bun's
  // node_modules workspace symlinks otherwise lead back to unmutated originals.
  resolve: {
    alias: {
      "@opencode-stats/browser-copy/testing": new URL(
        "../browser-copy/src/testing/index.ts",
        import.meta.url,
      ).pathname,
      "@opencode-stats/browser-copy/api": new URL("../browser-copy/src/api.ts", import.meta.url)
        .pathname,
      "@opencode-stats/browser-copy": new URL("../browser-copy/src/index.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.contract.test.{ts,tsx}", "**/dist/**", "**/.release/**", "**/.dev/**"],
    environment: "node",
  },
});
