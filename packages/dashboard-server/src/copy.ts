import { encode, type TokenKind } from "@opencode-stats/browser-copy";
import type { StoreCopy } from "@opencode-stats/stats-store";

export function encodeStore(copy: StoreCopy): Uint8Array {
  const column = (kind: TokenKind) =>
    Float64Array.from(copy.steps, (step) => step[kind] ?? Number.NaN);
  return new Uint8Array(
    encode({
      kind: copy.kind,
      generation: copy.generation,
      fromRevision: copy.fromRevision,
      revision: copy.revision,
      historyCompleteFrom: copy.historyCompleteFrom,
      ids: copy.facts.map((fact) => fact.id),
      tombstones: copy.tombstones.map((fact) => fact.id),
      names: [],
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
