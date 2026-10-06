import { execFileSync } from "node:child_process";

// The public e2e watchdog owns one deadline for preparation and tests together.
execFileSync(
  "bun",
  [
    "run",
    "--cwd",
    "packages/e2e",
    "playwright",
    "install",
    "--only-shell",
    ...(process.platform === "linux" ? ["--with-deps"] : []),
    "chromium",
    "webkit",
  ],
  { stdio: "inherit" },
);
execFileSync("bun", ["run", "opencode:prepare"], { stdio: "inherit" });
execFileSync(
  "bun",
  ["run", "vitest", "run", "--config", "packages/e2e/vitest.config.ts", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
