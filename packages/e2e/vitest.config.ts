import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["packages/e2e/tests/**/*.test.{ts,tsx}"], testTimeout: 30000 },
});
