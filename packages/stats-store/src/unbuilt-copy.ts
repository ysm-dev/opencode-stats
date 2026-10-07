import { randomUUID } from "node:crypto";
import type { StoreCopy } from "./store.ts";

export function unbuiltCopy(): StoreCopy {
  return {
    kind: "whole",
    generation: randomUUID(),
    revision: 0,
    fromRevision: 0,
    historyComplete: false,
    historyCompleteFrom: 0,
    steps: [],
    prompts: [],
    tools: [],
    facts: [],
    tombstones: [],
    names: [],
    sessions: [],
    projects: [],
    sessionTombstones: [],
    projectTombstones: [],
    pricing: {
      catalog: { id: 1, source: "unavailable", stamp: null, updatedAt: 0, digest: null },
      models: [],
    },
  };
}
