import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { testTimeouts } from "../../scripts/test-timeouts.ts";

export default defineConfig({
  plugins: [solid({ hot: false })],
  test: {
    ...testTimeouts,
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://127.0.0.1:22440" } },
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/*.contract.test.{ts,tsx}", "**/dist/**", "**/.release/**", "**/.dev/**"],
  },
});
