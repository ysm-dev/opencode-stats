import * as Schema from "effect/Schema";
import { addDates, dateCount, localDate, midnight } from "./calendar.ts";

export const Preset = Schema.Literals(["today", "7d", "30d", "90d", "180d", "365d", "all"]);
export type Preset = typeof Preset.Type;
export type TimeRange = Preset | { from: string; to: string };
export type Period = { start: number; end: number; from: string; to: string; days: number };
export const presetLabels: Record<Preset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "180d": "Last 180 days",
  "365d": "Last 365 days",
  all: "All time",
};
export const presets: readonly Preset[] = ["today", "7d", "30d", "90d", "180d", "365d", "all"];
const DateInput = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));
const dateInput = Schema.decodeUnknownSync(DateInput);
const parseDate = (input: string | null) => {
  const value = dateInput(input);
  if (addDates(value, 0) !== value) throw new Error("Invalid local date");
  return value;
};

export function parseRange(address: string, baseUrl: string): TimeRange {
  const url = new URL(address, baseUrl);
  if (url.origin !== new URL(baseUrl).origin || url.pathname !== "/")
    throw new Error("Invalid address");
  for (const key of ["range", "from", "to"]) {
    if (url.searchParams.getAll(key).length > 1) throw new Error("Duplicate range parameter");
  }
  const range = url.searchParams.get("range");
  if (range !== "fixed") {
    if (url.searchParams.has("from") || url.searchParams.has("to"))
      throw new Error("Unexpected dates");
    return range === null ? "30d" : Schema.decodeUnknownSync(Preset)(range);
  }
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  if (from > to) throw new Error("Reversed range");
  return { from, to };
}

export const rangeAddress = (range: TimeRange) =>
  typeof range === "string"
    ? `/?range=${range}`
    : `/?range=fixed&from=${range.from}&to=${range.to}`;

export function resolveRange(
  range: TimeRange,
  now: number,
  timeZone: string,
  history: number,
): Period {
  const today = localDate(now, timeZone);
  const days =
    typeof range === "string"
      ? range === "today"
        ? 1
        : Number.parseInt(range)
      : dateCount(range.from, range.to);
  const from =
    typeof range === "string"
      ? range === "all"
        ? localDate(history, timeZone)
        : addDates(today, 1 - days)
      : range.from;
  const to = typeof range === "string" ? today : range.to;
  return {
    from,
    to,
    days: range === "all" ? dateCount(from, to) : days,
    start: range === "all" ? history : midnight(from, timeZone),
    end: Math.min(now, midnight(addDates(to, 1), timeZone)),
  };
}

export function normalizeRange(range: TimeRange, now: number, timeZone: string): TimeRange {
  if (typeof range === "string" || range.to !== localDate(now, timeZone)) return range;
  const days = dateCount(range.from, range.to);
  return (
    presets.find((key) => key !== "all" && (key === "today" ? 1 : Number.parseInt(key)) === days) ??
    range
  );
}

export function shiftRange(
  range: TimeRange,
  direction: -1 | 1,
  now: number,
  timeZone: string,
): TimeRange {
  if (range === "all") return range;
  const period = resolveRange(range, now, timeZone, now);
  const next = {
    from: addDates(period.from, direction * period.days),
    to: addDates(period.to, direction * period.days),
  };
  if (direction === 1 && next.from > localDate(now, timeZone)) return range;
  return normalizeRange(next, now, timeZone);
}

export function previousPeriod(
  range: TimeRange,
  period: Period,
  timeZone: string,
  history: number,
): Period | null {
  if (range === "all") return null;
  const from = addDates(period.from, -period.days);
  const to = addDates(period.to, -period.days);
  const start = midnight(from, timeZone);
  if (start < history) return null;
  const end = midnight(addDates(to, 1), timeZone);
  const running = period.end < midnight(addDates(period.to, 1), timeZone);
  return {
    from,
    to,
    days: period.days,
    start,
    end: running ? Math.min(end, start + Math.max(0, period.end - period.start)) : end,
  };
}
