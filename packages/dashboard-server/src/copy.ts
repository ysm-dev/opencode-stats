import { encode, type TokenKind } from "@opencode-stats/browser-copy";
import type { StoreCopy } from "@opencode-stats/stats-store";

export function encodeStore(copy: StoreCopy): Uint8Array {
  const column = (kind: TokenKind) =>
    Float64Array.from(copy.steps, (step) => step[kind] ?? Number.NaN);
  return new Uint8Array(
    encode({
      generation: copy.generation,
      fromRevision: 0,
      revision: copy.revision,
      historyCompleteFrom: copy.historyCompleteFrom,
      steps: {
        start: Float64Array.from(copy.steps, (step) => step.start),
        input: column("input"),
        cacheRead: column("cacheRead"),
        cacheWrite: column("cacheWrite"),
        output: column("output"),
        reasoning: column("reasoning"),
      },
    }),
  );
}
