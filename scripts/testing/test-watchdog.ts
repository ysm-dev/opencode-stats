import process from "node:process";
import { killProcessTree } from "../process-tree.ts";
import { TIME_BUDGET_MS } from "../time-budget.ts";

const pid = Number(process.argv[2]);
const deadline = Number(process.argv[3]);
const remaining = deadline - Date.now();
if (
  !Number.isSafeInteger(pid) ||
  pid <= 0 ||
  !Number.isSafeInteger(deadline) ||
  deadline <= 0 ||
  remaining > TIME_BUDGET_MS
)
  throw new Error("Invalid watchdog arguments");
const timer = setTimeout(
  () => {
    process.stderr.write("Five-minute test-run time budget exceeded\n");
    killProcessTree(pid);
  },
  Math.max(0, remaining),
);
process.once("disconnect", () => clearTimeout(timer));
process.send?.("armed");
