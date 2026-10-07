import { fileURLToPath } from "node:url";

// Keep individual tests/hooks tighter than the five-minute whole-run deadline.
export const testTimeouts = {
  testTimeout: 5_000,
  hookTimeout: 10_000,
  teardownTimeout: 10_000,
  globalSetup: [fileURLToPath(new URL("./testing/time-budget-setup.ts", import.meta.url))],
};
