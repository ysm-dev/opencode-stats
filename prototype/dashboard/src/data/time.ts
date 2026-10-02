// PROTOTYPE: time ranges as settled in issue #12, reckoned in the browser's timezone.

export type Preset = "today" | "7d" | "30d" | "90d" | "180d" | "365d" | "all";
export type Unit = "hour" | "day" | "week" | "month";

export const PRESETS: { id: Preset; short: string; long: string }[] = [
  { id: "today", short: "Today", long: "Today" },
  { id: "7d", short: "7D", long: "Last 7 days" },
  { id: "30d", short: "30D", long: "Last 30 days" },
  { id: "90d", short: "90D", long: "Last 90 days" },
  { id: "180d", short: "180D", long: "Last 180 days" },
  { id: "365d", short: "365D", long: "Last 365 days" },
  { id: "all", short: "All", long: "All time" },
];

const PRESET_DAYS: Record<Preset, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
  all: 0,
};

/** A preset moves with the clock; a fixed range is pinned to local days. */
export type RangeSpec =
  | { kind: "preset"; preset: Preset }
  | { kind: "fixed"; unit: "day" | "week" | "month"; start: string }
  | { kind: "fixed"; unit: "days"; start: string; days: number };

export interface Range {
  spec: RangeSpec;
  start: number; // inclusive
  axisEnd: number; // exclusive end of the axis
  end: number; // exclusive end of data: min(axisEnd, now)
  running: boolean;
  bucket: Unit;
  days: number;
}

export interface Bucket {
  start: number; // clipped to the range
  end: number;
  unitStart: number; // the whole bucket's start, for drilling and labels
  partial: boolean; // clipped by the range or still running
  future: boolean;
}

export const DAY = 86400000;

export function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(t: number, n: number): number {
  const d = new Date(t);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + n,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  ).getTime();
}

export function startOfWeek(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
}

export function startOfMonth(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function addMonths(t: number, n: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

export function dayKey(t: number): string {
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function parseDay(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getTime();
}

export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

export function bucketFor(days: number): Unit {
  if (days <= 1) return "hour";
  if (days <= 90) return "day";
  if (days <= 365) return "week";
  return "month";
}

export function startOfUnit(t: number, unit: Unit): number {
  if (unit === "hour") return t - (t % 3600000);
  if (unit === "day") return startOfDay(t);
  if (unit === "week") return startOfWeek(t);
  return startOfMonth(t);
}

export function nextUnit(t: number, unit: Unit): number {
  if (unit === "hour") return t + 3600000;
  if (unit === "day") return addDays(t, 1);
  if (unit === "week") return addDays(t, 7);
  return addMonths(t, 1);
}

function make(spec: RangeSpec, start: number, axisEnd: number, now: number, unit?: Unit): Range {
  const days = daysBetween(start, axisEnd);
  return {
    spec,
    start,
    axisEnd,
    end: Math.min(axisEnd, now),
    running: axisEnd > now,
    bucket: unit ?? bucketFor(days),
    days,
  };
}

function fixedBounds(spec: Extract<RangeSpec, { kind: "fixed" }>): [number, number] {
  const start = parseDay(spec.start);
  if (spec.unit === "days") return [start, addDays(start, spec.days)];
  if (spec.unit === "day") return [start, addDays(start, 1)];
  if (spec.unit === "week") return [start, addDays(start, 7)];
  return [start, addMonths(start, 1)];
}

export function resolve(spec: RangeSpec, now: number, first: number): Range {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  if (spec.kind === "fixed") {
    const [start, end] = fixedBounds(spec);
    return make(spec, start, end, now);
  }
  if (spec.preset === "all") {
    const unit = bucketFor(daysBetween(first, tomorrow));
    return make(spec, startOfUnit(first, unit), tomorrow, now, unit);
  }
  return make(spec, addDays(today, 1 - PRESET_DAYS[spec.preset]), tomorrow, now);
}

export function buckets(r: Range, now: number): Bucket[] {
  const out: Bucket[] = [];
  // Hours step in real time from local midnight, so a daylight-saving day has 23 or 25 buckets.
  const first = r.bucket === "hour" ? r.start : startOfUnit(r.start, r.bucket);
  for (let t = first; t < r.axisEnd; t = nextUnit(t, r.bucket)) {
    const next = nextUnit(t, r.bucket);
    const start = Math.max(t, r.start);
    const end = Math.min(next, r.axisEnd);
    const running = now >= start && now < end;
    out.push({
      start,
      end,
      unitStart: t,
      partial: start > t || end < next || running,
      future: start >= now,
    });
  }
  return out;
}

/** Drilling narrows the range to a bucket: a month or week opens as days, a day as hours. */
export function drill(b: Bucket, unit: Unit): RangeSpec | null {
  if (unit === "hour") return null;
  if (unit === "day") return { kind: "fixed", unit: "day", start: dayKey(b.unitStart) };
  if (unit === "week") return { kind: "fixed", unit: "week", start: dayKey(b.unitStart) };
  return { kind: "fixed", unit: "month", start: dayKey(b.unitStart) };
}

function normalize(spec: RangeSpec, now: number): RangeSpec {
  if (spec.kind !== "fixed") return spec;
  const today = dayKey(now);
  if (spec.unit === "day" && spec.start === today) return { kind: "preset", preset: "today" };
  if (spec.unit !== "days") return spec;
  const end = dayKey(addDays(parseDay(spec.start), spec.days - 1));
  const preset = PRESETS.find((p) => PRESET_DAYS[p.id] === spec.days && p.id !== "today");
  return end === today && preset ? { kind: "preset", preset: preset.id } : spec;
}

/** Shifting moves a range to its neighbour of the same kind. Null when it can't move that way. */
export function shift(spec: RangeSpec, dir: -1 | 1, now: number): RangeSpec | null {
  const today = startOfDay(now);
  let next: RangeSpec;
  if (spec.kind === "preset") {
    if (spec.preset === "all") return null;
    const n = PRESET_DAYS[spec.preset];
    const start = addDays(today, 1 - n + dir * n);
    next =
      spec.preset === "today"
        ? { kind: "fixed", unit: "day", start: dayKey(start) }
        : { kind: "fixed", unit: "days", start: dayKey(start), days: n };
  } else {
    const start = parseDay(spec.start);
    if (spec.unit === "days") next = { ...spec, start: dayKey(addDays(start, dir * spec.days)) };
    else if (spec.unit === "day") next = { ...spec, start: dayKey(addDays(start, dir)) };
    else if (spec.unit === "week") next = { ...spec, start: dayKey(addDays(start, dir * 7)) };
    else next = { ...spec, start: dayKey(addMonths(start, dir)) };
  }
  if (next.kind === "fixed" && parseDay(next.start) > today) return null;
  return normalize(next, now);
}

/** The range shifted back once, cut at the same elapsed point while the range is running. */
export function previous(r: Range, now: number, first: number): Range | null {
  const spec = shift(r.spec, -1, now);
  if (!spec) return null;
  const p = resolve(spec, now, first);
  if (p.start < startOfDay(first)) return null;
  const end = r.running ? Math.min(p.axisEnd, p.start + (now - r.start)) : p.axisEnd;
  return { ...p, end, running: false };
}

export function inRange(t: number, r: { start: number; end: number }): boolean {
  return t >= r.start && t < r.end;
}

export function specKey(spec: RangeSpec): string {
  if (spec.kind === "preset") return spec.preset;
  return spec.unit === "days" ? `days:${spec.start}:${spec.days}` : `${spec.unit}:${spec.start}`;
}

export function parseSpec(key: string | null): RangeSpec {
  const preset = PRESETS.find((p) => p.id === key);
  if (preset) return { kind: "preset", preset: preset.id };
  const [unit, start, days] = (key ?? "").split(":");
  if (start && (unit === "day" || unit === "week" || unit === "month")) {
    return { kind: "fixed", unit, start };
  }
  if (start && unit === "days" && Number(days) > 0) {
    return { kind: "fixed", unit: "days", start, days: Number(days) };
  }
  return { kind: "preset", preset: "30d" };
}
