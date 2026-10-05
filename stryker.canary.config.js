import config from "./stryker.config.js";

export default {
  ...config,
  // Intersect with the real mutation scope: never replace its exclusion/waiver rules.
  mutate: [...config.mutate, "!**/!(*gate-canary*).{ts,tsx}"],
  concurrency: 1,
};
