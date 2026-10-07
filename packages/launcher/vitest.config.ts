import { defineConfig } from "vitest/config";
import { testTimeouts } from "../../scripts/test-timeouts.ts";

export default defineConfig({ test: { ...testTimeouts, include: ["src/**/*.test.{ts,tsx}"] } });
