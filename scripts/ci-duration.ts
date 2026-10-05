import process from "node:process";
import { remainingBudget } from "./time-budget.ts";

const remaining = remainingBudget(Date.parse(process.argv[2] ?? ""), Date.now());
process.stdout.write(
  `CI is within its five-minute budget (${Math.floor(remaining / 1000)}s left).\n`,
);
