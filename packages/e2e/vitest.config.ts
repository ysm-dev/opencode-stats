import { defineConfig } from "vitest/config";
import { testTimeouts } from "../../scripts/test-timeouts.ts";

export default defineConfig({
  test: { ...testTimeouts, include: ["packages/e2e/tests/**/*.test.{ts,tsx}"], testTimeout: 30000 },
});
