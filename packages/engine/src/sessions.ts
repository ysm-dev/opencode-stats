const place = (map: Map<number, number>, code: number, start: number) =>
  map.set(code, Math.min(map.get(code) ?? start, start));

const emptyPlacements = () => ({
  roots: new Map<number, number>(),
  subagents: new Map<number, number>(),
  first: Infinity,
});
type SessionStep = { start: number; session: number; subagent: number };
function placeStep(placements: ReturnType<typeof emptyPlacements>, fact: SessionStep) {
  placements.first = Math.min(placements.first, fact.start);
  if (!Number.isNaN(fact.session)) place(placements.roots, fact.session, fact.start);
  if (!Number.isNaN(fact.subagent) && fact.subagent !== fact.session)
    place(placements.subagents, fact.subagent, fact.start);
}

export function matchingPlacements(facts: Iterable<SessionStep>) {
  const placements = emptyPlacements();
  for (const fact of facts) placeStep(placements, fact);
  return placements;
}

// #13, as sourced by #27: the owning session includes every descendant step,
// but a subagent is placed only by its own steps, never by another subagent's.
// Counted ownership already identifies a stand-in; parent links are not needed.
export async function placeSessions(
  facts: Iterable<SessionStep>,
  checkpoint: () => Promise<void>,
  signal: AbortSignal,
) {
  const placements = emptyPlacements();
  for (const fact of facts) {
    if (signal.aborted) break;
    placeStep(placements, fact);
    await checkpoint();
  }
  return placements;
}
