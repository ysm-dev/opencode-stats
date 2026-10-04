import { tokenKinds, type BrowserCopy } from "@opencode-stats/browser-copy";
import type { EngineState } from "./protocol.ts";

export function completeState(copy: BrowserCopy): EngineState {
  const amounts = { input: 0n, cacheRead: 0n, cacheWrite: 0n, output: 0n, reasoning: 0n };
  let total = 0n;
  for (const kind of tokenKinds) {
    for (const value of copy.steps[kind]) {
      if (!Number.isNaN(value)) amounts[kind] += BigInt(value);
    }
    total += amounts[kind];
  }
  const tokens = {
    total: Number(total),
    input: Number(amounts.input),
    cacheRead: Number(amounts.cacheRead),
    cacheWrite: Number(amounts.cacheWrite),
    output: Number(amounts.output),
    reasoning: Number(amounts.reasoning),
  };
  return { screen: "dashboard", address: "/?range=all", rangeLabel: "All time", tokens };
}
