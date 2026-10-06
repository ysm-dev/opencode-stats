import {
  encode,
  mapStepFields,
  mapSessionFields,
  mapPromptFields,
} from "@opencode-stats/browser-copy";
import type { StoreCopy } from "@opencode-stats/stats-store";

export function encodeStore(copy: StoreCopy): Uint8Array {
  return new Uint8Array(
    encode({
      kind: copy.kind,
      generation: copy.generation,
      fromRevision: copy.fromRevision,
      revision: copy.revision,
      historyCompleteFrom: copy.historyCompleteFrom,
      ids: copy.facts.map((fact) => fact.id),
      promptIds: copy.prompts.map((fact) => fact.id),
      prompts: mapPromptFields((field) =>
        Float64Array.from(copy.prompts, (row) => row[field] ?? NaN),
      ),
      tombstones: copy.tombstones.map((fact) => fact.id),
      names: copy.names,
      sessions: mapSessionFields((field) =>
        Float64Array.from(copy.sessions, (row) => row[field] ?? NaN),
      ),
      projects: Float64Array.from(copy.projects),
      sessionTombstones: Float64Array.from(copy.sessionTombstones),
      projectTombstones: Float64Array.from(copy.projectTombstones),
      steps: mapStepFields((field) => Float64Array.from(copy.steps, (row) => row[field] ?? NaN)),
    }),
  );
}
