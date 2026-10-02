// PROTOTYPE: time-series, contribution graph, streaks and the weekday × hour grid.
import type { Db, Step } from "./db";
import {
  type Dimension,
  type Filters,
  type Firsts,
  keyOf,
  label,
  matcher,
  percentile,
  stepsIn,
  tokensOf,
  toolsIn,
} from "./query";
import { addDays, type Bucket, dayKey, startOfDay } from "./time";

export type Metric =
  | "tokens"
  | "est"
  | "rec"
  | "steps"
  | "prompts"
  | "toolCalls"
  | "sessions"
  | "cacheHitRate"
  | "respMedian"
  | "failureRate";

export const METRICS: { id: Metric; label: string; additive: boolean }[] = [
  { id: "tokens", label: "Tokens", additive: true },
  { id: "est", label: "Estimated cost", additive: true },
  { id: "rec", label: "Recorded cost", additive: true },
  { id: "steps", label: "Steps", additive: true },
  { id: "prompts", label: "Prompts", additive: true },
  { id: "toolCalls", label: "Tool calls", additive: true },
  { id: "sessions", label: "Sessions", additive: false },
  { id: "cacheHitRate", label: "Cache hit rate", additive: false },
  { id: "respMedian", label: "Response time (median)", additive: false },
  { id: "failureRate", label: "Failure rate", additive: false },
];

export type Split = "none" | "kind" | Exclude<Dimension, "session">;

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[]; // one per bucket
}

const PALETTE = [1, 2, 3, 4, 5, 6, 7].map((i) => `var(--chart-${i})`);
export const KINDS: { key: keyof Step; label: string; color: string }[] = [
  { key: "input", label: "Input", color: "var(--kind-input)" },
  { key: "cacheRead", label: "Cache read", color: "var(--kind-cache-read)" },
  { key: "cacheWrite", label: "Cache write", color: "var(--kind-cache-write)" },
  { key: "output", label: "Output", color: "var(--kind-output)" },
  { key: "reasoning", label: "Reasoning", color: "var(--kind-reasoning)" },
];

function bucketIndex(buckets: Bucket[], t: number): number {
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (buckets[mid]!.start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function stepValue(metric: Metric, s: Step): number {
  if (metric === "tokens") return tokensOf(s);
  if (metric === "est") return s.est ?? 0;
  if (metric === "rec") return s.rec;
  return 1;
}

function additive(
  db: Db,
  f: Filters,
  buckets: Bucket[],
  metric: Metric,
  split: Split,
  top: number,
): Series[] {
  const span = { start: buckets[0]!.start, end: buckets[buckets.length - 1]!.end };
  const n = buckets.length;
  const sums = new Map<string, number[]>();
  const add = (key: string, i: number, v: number) => {
    let arr = sums.get(key);
    if (!arr) sums.set(key, (arr = new Array<number>(n).fill(0)));
    arr[i] = arr[i]! + v;
  };
  if (metric === "toolCalls") {
    for (const c of toolsIn(db, f, span)) {
      add(
        split === "none"
          ? "all"
          : split === "tool"
            ? c.tool
            : split === "kind"
              ? "all"
              : keyOf(split, c),
        bucketIndex(buckets, c.at),
        1,
      );
    }
  } else if (metric === "prompts") {
    const keep = matcher(f);
    for (const p of db.prompts) {
      if (p.at < span.start || p.at >= span.end || !keep(p)) continue;
      add(
        split === "none" || split === "kind" || split === "tool" ? "all" : keyOf(split, p),
        bucketIndex(buckets, p.at),
        1,
      );
    }
  } else {
    for (const s of stepsIn(db, f, span)) {
      const i = bucketIndex(buckets, s.at);
      if (split === "kind" && metric === "tokens") {
        for (const k of KINDS) add(k.key, i, s[k.key] as number);
      } else {
        add(
          split === "none" || split === "kind" || split === "tool" ? "all" : keyOf(split, s),
          i,
          stepValue(metric, s),
        );
      }
    }
  }
  if (split === "kind" && metric === "tokens") {
    return KINDS.map((k) => ({
      key: k.key,
      label: k.label,
      color: k.color,
      values: sums.get(k.key) ?? new Array<number>(n).fill(0),
    }));
  }
  const ranked = [...sums].sort(
    (a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0),
  );
  const out: Series[] = ranked.slice(0, top).map(([key, values], i) => ({
    key,
    label:
      key === "all"
        ? (METRICS.find((m) => m.id === metric)?.label ?? key)
        : split === "none" || split === "kind"
          ? key
          : label(db, split, key),
    color: PALETTE[i % PALETTE.length]!,
    values,
  }));
  const rest = ranked.slice(top);
  if (rest.length) {
    const values = new Array<number>(n).fill(0);
    for (const [, v] of rest) v.forEach((x, i) => (values[i] = values[i]! + x));
    out.push({ key: "__other", label: `${rest.length} more`, color: "var(--chart-other)", values });
  }
  return out;
}

function ratio(db: Db, f: Filters, buckets: Bucket[], metric: Metric, firsts: Firsts): Series[] {
  const values = buckets.map((b) => {
    if (metric === "sessions") {
      let n = 0;
      for (const t of firsts.sessions.values()) if (t >= b.start && t < b.end) n++;
      return n;
    }
    const steps = stepsIn(db, f, b);
    if (metric === "cacheHitRate") {
      let read = 0;
      let sent = 0;
      for (const s of steps) {
        read += s.cacheRead;
        sent += s.input + s.cacheRead + s.cacheWrite;
      }
      return sent ? read / sent : Number.NaN;
    }
    if (metric === "failureRate") {
      const failed = steps.filter((s) => s.error && s.error !== "aborted").length;
      return steps.length ? failed / steps.length : Number.NaN;
    }
    const resp = steps.flatMap((s) => (s.resp === null ? [] : [s.resp])).sort((a, b) => a - b);
    return percentile(resp, 0.5) ?? Number.NaN;
  });
  const name = METRICS.find((m) => m.id === metric)?.label ?? metric;
  return [{ key: metric, label: name, color: "var(--chart-1)", values }];
}

/** Values per bucket. Additive metrics can be split and stacked; the rest are one line. */
export function timeSeries(
  db: Db,
  f: Filters,
  buckets: Bucket[],
  metric: Metric,
  split: Split,
  firsts: Firsts,
  top = 6,
): Series[] {
  if (!buckets.length) return [];
  const isAdditive = METRICS.find((m) => m.id === metric)?.additive;
  return isAdditive
    ? additive(db, f, buckets, metric, split, top)
    : ratio(db, f, buckets, metric, firsts);
}

export type ContributionMetric = "tokens" | "steps" | "cost";

export interface DayCell {
  t: number;
  value: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** The past 365 local days, whatever the range. Levels are quartiles of the active days. */
export function contribution(
  db: Db,
  f: Filters,
  now: number,
  metric: ContributionMetric,
): DayCell[] {
  const today = startOfDay(now);
  const start = addDays(today, -364);
  const values = new Map<string, number>();
  const keep = matcher(f);
  for (const s of db.steps) {
    if (s.at < start || !keep(s)) continue;
    const k = dayKey(s.at);
    const v = metric === "tokens" ? tokensOf(s) : metric === "steps" ? 1 : (s.est ?? 0);
    values.set(k, (values.get(k) ?? 0) + v);
  }
  const active = [...values.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const q = [0.25, 0.5, 0.75].map((p) => percentile(active, p) ?? 0);
  const cells: DayCell[] = [];
  for (let t = start; t <= today; t = addDays(t, 1)) {
    const value = values.get(dayKey(t)) ?? 0;
    const level = value <= 0 ? 0 : value <= q[0]! ? 1 : value <= q[1]! ? 2 : value <= q[2]! ? 3 : 4;
    cells.push({ t, value, level });
  }
  return cells;
}

export interface Streaks {
  current: number;
  longest: number;
  longestEnd: number | null;
}

/** Streaks follow the filters and ignore the time range. */
export function streaks(db: Db, f: Filters, now: number): Streaks {
  const keep = matcher(f);
  const days = new Set<string>();
  for (const s of db.steps) if (keep(s)) days.add(dayKey(s.at));
  let longest = 0;
  let longestEnd: number | null = null;
  let run = 0;
  const today = startOfDay(now);
  for (let t = startOfDay(db.first); t <= today; t = addDays(t, 1)) {
    run = days.has(dayKey(t)) ? run + 1 : 0;
    if (run > longest) {
      longest = run;
      longestEnd = t;
    }
  }
  let current = 0;
  let t = days.has(dayKey(today)) ? today : addDays(today, -1);
  while (days.has(dayKey(t))) {
    current++;
    t = addDays(t, -1);
  }
  return { current, longest, longestEnd };
}

/** Local weekday (Monday first) × local clock hour. */
export function punchcard(
  db: Db,
  f: Filters,
  span: { start: number; end: number },
  metric: "steps" | "tokens",
): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const s of stepsIn(db, f, span)) {
    const d = new Date(s.at);
    const row = grid[(d.getDay() + 6) % 7]!;
    row[d.getHours()] = row[d.getHours()]! + (metric === "tokens" ? tokensOf(s) : 1);
  }
  return grid;
}
