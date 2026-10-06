import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";

const place = (map: Map<number, number>, code: number, start: number) =>
  map.set(code, Math.min(map.get(code) ?? start, start));

// A placement is the earliest step anywhere below that session. Empty sessions
// have no placement; a stand-in is already identified by the counted facts.
export async function placeSessions(
  facts: Iterable<{ start: number; session: number; subagent: number }>,
  sessions: HashMap.HashMap<number, { parent: number; session: number }>,
  checkpoint: () => Promise<void>,
  signal: AbortSignal,
) {
  const roots = new Map<number, number>();
  const subagents = new Map<number, number>();
  let first = Infinity;
  for (const fact of facts) {
    if (signal.aborted) break;
    first = Math.min(first, fact.start);
    if (!Number.isNaN(fact.session)) place(roots, fact.session, fact.start);
    let code = fact.subagent;
    const visited = new Set<number>();
    while (!Number.isNaN(code) && code !== fact.session && !visited.has(code)) {
      visited.add(code);
      place(subagents, code, fact.start);
      code = Option.getOrUndefined(HashMap.get(sessions, code))?.parent ?? NaN;
      await checkpoint();
      if (signal.aborted) break;
    }
    await checkpoint();
  }
  return { roots, subagents, first };
}
