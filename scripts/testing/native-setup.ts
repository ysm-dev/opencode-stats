import { execFileSync } from "node:child_process";

// Prepare controlled native inputs before any source test opens SQLite.
export default function setup(): void {
  execFileSync("bun", ["run", "scripts/native-prepare.ts"], { stdio: "pipe" });
}
