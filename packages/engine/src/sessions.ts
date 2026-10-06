import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";

const place = (map: Map<number, number>, code: number, start: number) =>
  map.set(code, Math.min(map.get(code) ?? start, start));

const emptyPlacements = () => ({
  roots: new Map<number, number>(),
  subagents: new Map<number, number>(),
  first: Infinity,
});
type SessionStep = { start: number; session: number; subagent: number };
type SessionMap = HashMap.HashMap<number, { parent: number; session: number }>;

function* placementSteps(
  facts: Iterable<SessionStep>,
  sessions: SessionMap,
  placements: ReturnType<typeof emptyPlacements>,
) {
  for (const fact of facts) {
    placements.first = Math.min(placements.first, fact.start);
    if (!Number.isNaN(fact.session)) place(placements.roots, fact.session, fact.start);
    let code = fact.subagent;
    const visited = new Set<number>();
    while (!Number.isNaN(code) && code !== fact.session && !visited.has(code)) {
      visited.add(code);
      place(placements.subagents, code, fact.start);
      code = Option.getOrUndefined(HashMap.get(sessions, code))?.parent ?? NaN;
      yield;
    }
    yield;
  }
}

export function matchingPlacements(facts: Iterable<SessionStep>, sessions: SessionMap) {
  const placements = emptyPlacements();
  const steps = placementSteps(facts, sessions, placements);
  while (!steps.next().done) {
    /* Consume the same ancestor walk without asynchronous slice boundaries. */
  }
  return placements;
}

// A placement is the earliest step anywhere below that session. Empty sessions
// have no placement; a stand-in is already identified by the counted facts.
export async function placeSessions(
  facts: Iterable<{ start: number; session: number; subagent: number }>,
  sessions: HashMap.HashMap<number, { parent: number; session: number }>,
  checkpoint: () => Promise<void>,
  signal: AbortSignal,
) {
  const placements = emptyPlacements();
  const steps = placementSteps(facts, sessions, placements);
  while (!signal.aborted && !steps.next().done) {
    await checkpoint();
  }
  return placements;
}
