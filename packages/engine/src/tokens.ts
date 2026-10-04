import { tokenKinds, type BrowserCopy } from "@opencode-stats/browser-copy";
import type { EngineState } from "./protocol.ts";

export function completeState(copy: BrowserCopy): EngineState {
  const tokens = { total: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  for (const kind of tokenKinds) {
    for (const value of copy.steps[kind]) {
      if (!Number.isNaN(value)) tokens[kind] += value;
    }
    tokens.total += tokens[kind];
  }
  return { screen: "dashboard", address: "/?range=all", rangeLabel: "All time", tokens };
}
