import {
  sessionFields,
  mapStepFields,
  mapSessionFields,
  mapPromptFields,
  mapToolFields,
  validateFactNames,
  type BrowserCopy,
  type DimensionName,
} from "@opencode-stats/browser-copy";
import type { CopyCursor } from "@opencode-stats/browser-copy/api";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import type { EngineClock } from "./clock.ts";
import { placeSessions, matchingPlacements } from "./sessions.ts";
import { emptyAmounts, adjust, totals, type Fact } from "./amounts.ts";
import { emptyDays, updateDay, dayTotals, checklistAmounts } from "./days.ts";
import {
  compileFilters,
  filterDimensions,
  filterName,
  matchingFacts,
  matchesFilters,
  type Filter,
} from "./filters.ts";
import { localDate, midnight } from "./calendar.ts";
import type { Period } from "./ranges.ts";
import { stepMetrics, type PromptFact } from "./step-metrics.ts";
import { toolMetrics, type ToolFact } from "./tool-metrics.ts";
import { startOfHistory, activeFacts } from "./history.ts";
import { usageChart } from "./chart.ts";
import type { ChartChoice } from "./chart-choice.ts";

const row = (copy: BrowserCopy, index: number): Fact =>
  mapStepFields((field) => copy.steps[field][index]!);

const emptySnapshot = () => ({
  facts: HashMap.empty<string, Fact>(),
  prompts: HashMap.empty<string, PromptFact>(),
  tools: HashMap.empty<string, ToolFact>(),
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

async function applyCalls(
  next: ReturnType<typeof emptySnapshot>,
  copy: BrowserCopy,
  checkpoint: () => Promise<void>,
  signal: AbortSignal,
): Promise<boolean> {
  for (const [index, id] of copy.toolIds.entries()) {
    if (signal.aborted) return false;
    next.tools = HashMap.set(
      next.tools,
      id,
      mapToolFields((field) => copy.tools[field][index]!),
    );
    await checkpoint();
  }
  return true;
}

export function createFacts(clock: EngineClock) {
  let snapshot = emptySnapshot();
  const filteredPlacements = new Map<string, ReturnType<typeof matchingPlacements>>();
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
        historyComplete: boolean;
      })
    | undefined;
  const apply = async (
    copy: BrowserCopy,
    signal: AbortSignal,
    addWork: (work: number, started: number) => void,
  ): Promise<boolean> => {
    if (
      copy.kind === "changes" &&
      (copy.generation !== current?.generation || copy.fromRevision !== current.revision)
    )
      return false;
    const next =
      copy.kind === "whole" ? emptySnapshot() : { ...snapshot, amounts: { ...snapshot.amounts } };
    let started = clock.workNow();
    const checkpoint = async () => {
      const elapsed = clock.workNow() - started;
      if (elapsed >= 4) {
        addWork(elapsed, started);
        await clock.yield(started);
        started = clock.workNow();
      }
    };
    try {
      // Validate against the proposed registry before touching even staged facts.
      // A malformed delta throws into live recovery without changing the last complete copy.
      if (copy.kind === "changes")
        validateFactNames(copy, [...HashMap.values(next.names), ...copy.names]);
      const rowsEnd = copy.tombstones.length + copy.ids.length;
      for (let index = 0; index < rowsEnd + copy.names.length; index++) {
        if (signal.aborted) return false;
        if (index < copy.tombstones.length) {
          const id = copy.tombstones[index]!;
          update(next, id);
          next.prompts = HashMap.remove(next.prompts, id);
          next.tools = HashMap.remove(next.tools, id);
        } else if (index < rowsEnd) {
          const position = index - copy.tombstones.length;
          update(next, copy.ids[position]!, row(copy, position));
        } else {
          const name = copy.names[index - rowsEnd]!;
          next.names = HashMap.set(next.names, `${name.dimension}\0${name.code}`, name);
        }
        await checkpoint();
      }
      for (const [index, id] of copy.promptIds.entries()) {
        if (signal.aborted) return false;
        next.prompts = HashMap.set(
          next.prompts,
          id,
          mapPromptFields((field) => copy.prompts[field][index]!),
        );
        await checkpoint();
      }
      if (!(await applyCalls(next, copy, checkpoint, signal))) return false;
      if (!(await applyDimensions(next, copy, checkpoint, signal))) return false;
      const sessions = await placeSessions(HashMap.values(next.facts), checkpoint, signal);
      if (signal.aborted) return false;
      // Persistent maps leave the prior complete copy available throughout every slice.
      snapshot = next;
      filteredPlacements.clear();
      placements = sessions;
      current = {
        generation: copy.generation,
        revision: copy.revision,
        historyCompleteFrom: copy.historyCompleteFrom,
        historyComplete: copy.historyComplete,
        tokens: totals(snapshot.amounts),
        sessions: { total: sessions.roots.size, subagents: sessions.subagents.size },
      };
      return true;
    } finally {
      addWork(clock.workNow() - started, started);
    }
  };
  const history = (now: number, timeZone: string) => {
    const first = [...HashMap.values(snapshot.prompts)].reduce(
      (start, prompt) => Math.min(start, prompt.start),
      placements.first,
    );
    return startOfHistory(
      current!.historyComplete,
      current!.historyCompleteFrom,
      first,
      now,
      timeZone,
    );
  };
  const names = () =>
    [...HashMap.values(snapshot.names)].filter((name) =>
      name.dimension === "session"
        ? HashMap.has(snapshot.sessions, name.code)
        : name.dimension !== "project" || HashMap.has(snapshot.projects, name.code),
    );
  const placementsFor = (
    filters: readonly Filter[],
    compiled: ReturnType<typeof compileFilters>,
  ) => {
    const key = JSON.stringify(filters);
    let placed = filteredPlacements.get(key);
    if (!placed) {
      placed =
        filters.length === 0
          ? placements
          : matchingPlacements(matchingFacts(HashMap.values(snapshot.facts), compiled));
      filteredPlacements.set(key, placed);
    }
    return placed;
  };
  const query = (period: Period, timeZone: string, filters: readonly Filter[]) => {
    indexZone(timeZone);
    const start = history(clock.now(), timeZone);
    period = { ...period, start: Math.max(period.start, start) };
    const compiled = compileFilters(filters, names());
    const placed = placementsFor(filters, compiled);
    const count = (map: Map<number, number>) =>
      [...map.values()].filter((instant) => instant >= period.start && instant < period.end).length;
    return {
      tokens: dayTotals(snapshot.days, period, compiled),
      sessions: { total: count(placed.roots), subagents: count(placed.subagents) },
      tools: toolMetrics(matchingFacts(HashMap.values(snapshot.tools), compiled), names(), period),
      metrics: stepMetrics(
        matchingFacts(activeFacts(HashMap.values(snapshot.facts), start), compiled),
        matchingFacts(activeFacts(HashMap.values(snapshot.prompts), start), compiled),
        names(),
        period,
      ),
    };
  };
  const filterState = (period: Period, timeZone: string, filters: readonly Filter[]) => {
    indexZone(timeZone);
    period = { ...period, start: Math.max(period.start, history(clock.now(), timeZone)) };
    const available = names();
    const compiled = compileFilters(filters, available);
    return {
      filters: filters.map((filter) => ({ ...filter, name: filterName(filter, available) })),
      checklists: filterDimensions
        .filter((dimension) => dimension !== "session")
        .map((dimension) => {
          const amounts =
            dimension === "tool"
              ? toolChecklist(HashMap.values(snapshot.tools), period, compiled)
              : checklistAmounts(snapshot.days, period, compiled, dimension);
          const maximum = Math.max(0, ...amounts.values());
          const values = available
            .filter((name) => name.dimension === dimension)
            .map((name) => ({
              id: name.id,
              name: name.name,
              tokens: amounts.get(name.code) ?? 0,
              selected: filters.some(
                (filter) => filter.dimension === dimension && filter.id === name.id,
              ),
              proportion: maximum === 0 ? 0 : (amounts.get(name.code) ?? 0) / maximum,
            }))
            .toSorted(
              (a, b) =>
                b.tokens - a.tokens || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
            );
          return { dimension, values };
        }),
    };
  };
  const chart = (
    period: Period,
    timeZone: string,
    locale: string,
    filters: readonly Filter[],
    choice: ChartChoice,
  ) => {
    const dataStart = Math.max(period.start, history(clock.now(), timeZone));
    const available = names();
    const compiled = compileFilters(filters, available);
    const steps = [...matchingFacts(HashMap.values(snapshot.facts), compiled)];
    const placed = placementsFor(filters, compiled);
    const inRange = <T extends { start: number }>(facts: Iterable<T>) =>
      [...facts].filter((fact) => fact.start >= dataStart && fact.start < period.end);
    return usageChart(
      period,
      timeZone,
      locale,
      choice,
      {
        steps: inRange(steps),
        prompts: inRange(matchingFacts(HashMap.values(snapshot.prompts), compiled)),
        tools: inRange(matchingFacts(HashMap.values(snapshot.tools), compiled)),
        sessions: [...placed.roots.values()].filter(
          (start) => start >= dataStart && start < period.end,
        ),
      },
      available,
      dataStart,
    );
  };
  return {
    apply,
    current: () => current,
    history,
    coversToday: () =>
      current!.historyComplete ||
      history(clock.now(), clock.timeZone()) <=
        midnight(localDate(clock.now(), clock.timeZone()), clock.timeZone()),
    query,
    chart,
    filterState,
    filterLabel: (filter: Filter) => filterName(filter, names()),
  };
}

function toolChecklist(
  facts: Iterable<ToolFact>,
  period: Period,
  filters: ReturnType<typeof compileFilters>,
) {
  const amounts = new Map<number, number>();
  for (const call of facts) {
    if (
      call.start >= period.start &&
      call.start < period.end &&
      matchesFilters(call, filters, "tool")
    )
      amounts.set(call.tool, (amounts.get(call.tool) ?? 0) + 1);
  }
  return amounts;
}
