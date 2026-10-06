import {
  sessionFields,
  mapStepFields,
  mapSessionFields,
  type BrowserCopy,
  type DimensionName,
} from "@opencode-stats/browser-copy";
import type { CopyCursor } from "@opencode-stats/browser-copy/api";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import type { EngineClock } from "./clock.ts";
import { placeSessions } from "./sessions.ts";
import { emptyAmounts, adjust, totals, type Fact } from "./amounts.ts";
import { emptyDays, updateDay, dayTotals } from "./days.ts";
import { localDate, midnight } from "./calendar.ts";
import type { Period } from "./ranges.ts";

const row = (copy: BrowserCopy, index: number): Fact =>
  mapStepFields((field) => copy.steps[field][index]!);

const emptySnapshot = () => ({
  facts: HashMap.empty<string, Fact>(),
  names: HashMap.empty<string, DimensionName>(),
  sessions: HashMap.empty<number, Readonly<Record<(typeof sessionFields)[number], number>>>(),
  projects: HashMap.empty<number, true>(),
  amounts: emptyAmounts(),
  days: emptyDays(),
  timeZone: "UTC",
});

function update(snapshot: ReturnType<typeof emptySnapshot>, id: string, next?: Fact) {
  const before = Option.getOrUndefined(HashMap.get(snapshot.facts, id));
  if (before) {
    adjust(snapshot.amounts, before, -1n);
    snapshot.days = updateDay(snapshot.days, id, before, snapshot.timeZone, -1n);
  }
  if (next) {
    adjust(snapshot.amounts, next, 1n);
    snapshot.days = updateDay(snapshot.days, id, next, snapshot.timeZone, 1n);
    snapshot.facts = HashMap.set(snapshot.facts, id, next);
  } else snapshot.facts = HashMap.remove(snapshot.facts, id);
}

async function applyDimensions(
  next: ReturnType<typeof emptySnapshot>,
  copy: BrowserCopy,
  checkpoint: () => Promise<void>,
  signal: AbortSignal,
): Promise<boolean> {
  const deletedEnd = copy.sessionTombstones.length;
  const sessionsEnd = deletedEnd + copy.sessions.code.length;
  const projectsStart = sessionsEnd + copy.projectTombstones.length;
  for (let index = 0; index < projectsStart + copy.projects.length; index++) {
    if (signal.aborted) return false;
    if (index < deletedEnd)
      next.sessions = HashMap.remove(next.sessions, copy.sessionTombstones[index]!);
    else if (index < sessionsEnd) {
      const position = index - deletedEnd;
      next.sessions = HashMap.set(
        next.sessions,
        copy.sessions.code[position]!,
        mapSessionFields((field) => copy.sessions[field][position]!),
      );
    } else if (index < projectsStart)
      next.projects = HashMap.remove(next.projects, copy.projectTombstones[index - sessionsEnd]!);
    else next.projects = HashMap.set(next.projects, copy.projects[index - projectsStart]!, true);
    await checkpoint();
  }
  return true;
}

export function createFacts(clock: EngineClock) {
  let snapshot = emptySnapshot();
  let placements = {
    roots: new Map<number, number>(),
    subagents: new Map<number, number>(),
    first: Infinity,
  };
  const indexZone = (timeZone: string) => {
    if (snapshot.timeZone === timeZone) return;
    let days = emptyDays();
    for (const [id, fact] of snapshot.facts) days = updateDay(days, id, fact, timeZone, 1n);
    snapshot = { ...snapshot, days, timeZone };
  };
  let current:
    | (CopyCursor & {
        tokens: ReturnType<typeof totals>;
        sessions: { total: number; subagents: number };
        historyCompleteFrom: number;
      })
    | undefined;
  const apply = async (copy: BrowserCopy, signal: AbortSignal): Promise<boolean> => {
    if (
      copy.kind === "changes" &&
      (copy.generation !== current?.generation || copy.fromRevision !== current.revision)
    )
      return false;
    const next =
      copy.kind === "whole" ? emptySnapshot() : { ...snapshot, amounts: { ...snapshot.amounts } };
    let started = clock.workNow();
    const checkpoint = async () => {
      if (clock.workNow() - started >= 4) {
        await clock.yield();
        started = clock.workNow();
      }
    };
    const rowsEnd = copy.tombstones.length + copy.ids.length;
    for (let index = 0; index < rowsEnd + copy.names.length; index++) {
      if (signal.aborted) return false;
      if (index < copy.tombstones.length) update(next, copy.tombstones[index]!);
      else if (index < rowsEnd) {
        const position = index - copy.tombstones.length;
        update(next, copy.ids[position]!, row(copy, position));
      } else {
        const name = copy.names[index - rowsEnd]!;
        next.names = HashMap.set(next.names, `${name.dimension}\0${name.code}`, name);
      }
      await checkpoint();
    }
    if (!(await applyDimensions(next, copy, checkpoint, signal))) return false;
    const sessions = await placeSessions(
      HashMap.values(next.facts),
      next.sessions,
      checkpoint,
      signal,
    );
    if (signal.aborted) return false;
    // Persistent maps leave the prior complete copy available throughout every slice.
    snapshot = next;
    placements = sessions;
    current = {
      generation: copy.generation,
      revision: copy.revision,
      historyCompleteFrom: copy.historyCompleteFrom,
      tokens: totals(snapshot.amounts),
      sessions: { total: sessions.roots.size, subagents: sessions.subagents.size },
    };
    return true;
  };
  const history = (now: number, timeZone: string) => {
    return placements.first === Infinity
      ? midnight(localDate(now, timeZone), timeZone)
      : placements.first;
  };
  const query = (period: Period, timeZone: string) => {
    indexZone(timeZone);
    const count = (map: Map<number, number>) =>
      [...map.values()].filter((start) => start >= period.start && start < period.end).length;
    return {
      tokens: dayTotals(snapshot.days, period, timeZone),
      sessions: { total: count(placements.roots), subagents: count(placements.subagents) },
    };
  };
  return { apply, current: () => current, history, query };
}
