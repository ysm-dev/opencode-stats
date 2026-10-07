import { defineConfig } from "vitest/config";
import { testTimeouts } from "../../scripts/test-timeouts.ts";
import { e2ePattern, e2eExcludes } from "../../scripts/e2e-plan.ts";
import { BalancedE2eSequencer } from "../../scripts/e2e-sequencer.ts";

export default defineConfig({
  test: {
    ...testTimeouts,
    include: [e2ePattern],
    exclude: e2eExcludes,
    sequence: { sequencer: BalancedE2eSequencer },
    testTimeout: 30000,
    // Concurrent cases own their homes, installs, processes and browser contexts.
    maxConcurrency: 2,
  },
});
