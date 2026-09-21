import { defineConfig } from "vitest/config";
import exceptions from "./quality-exceptions.json" with { type: "json" };

// `quality-exceptions.json`'s arrays are usually empty, which TypeScript infers as `never[]`.
// Cast to the known shape rather than let structural inference depend on current file content.
type CoverageException = { readonly path: string };

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        ...(exceptions.coverage as readonly CoverageException[]).map((entry) => entry.path),
      ],
      thresholds: { perFile: true, lines: 100, functions: 100, branches: 100, statements: 100 },
      reporter: ["text"],
    },
  },
});
