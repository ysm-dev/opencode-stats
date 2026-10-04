import { execFileSync } from "node:child_process";

// Root-owned preparation also runs inside mutation sandboxes, where .dev is
// correctly excluded from copied inputs but the controlled native inputs exist.
export default function setup(): void {
  execFileSync("bun", ["run", "scripts/native-prepare.ts"], { stdio: "pipe" });
}
