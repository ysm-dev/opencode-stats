import { defineConfig } from "vitest/config";
import { testTimeouts } from "../../scripts/test-timeouts.ts";

export default defineConfig({
  test: {
    ...testTimeouts,
    server: { deps: { inline: ["drizzle-orm", "@effect/sql-sqlite-bun"] } },
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.contract.test.{ts,tsx}", "**/dist/**", "**/.release/**", "**/.dev/**"],
  },
});
